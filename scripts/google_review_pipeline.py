#!/usr/bin/env python3
"""Append new inbox leads to Google Sheets and enrich them with OpenAI."""
from __future__ import annotations

import argparse
import csv
import json
import hashlib
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import gspread
from gspread.exceptions import APIError
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
SHEET_NAME = os.environ.get("GOOGLE_REVIEW_SHEET_NAME", "審核資料")
SPREADSHEET_ID = os.environ.get("GOOGLE_REVIEW_SPREADSHEET_ID", "")
HEADERS = ["資料類型", "收集時間", "縣市", "發布日期", "來源名稱", "來源標題", "來源網址", "審核狀態", "AI摘要", "AI分類", "AI判斷理由", "AI信心分數", "候選人／提出者", "政黨／提出者類型", "職務", "政策主張／具體訴求", "人工備註", "審核者", "審核時間", "發布ID"]
# Sheet 的 A:T 是審核台的欄位契約（Code.gs 的 HEADERS），不能動；
# 新的結構化欄位接在既有的 A:Z 之後，審核台不讀，不影響它的驗證。
EXTRA_HEADERS = ["政見名稱", "政策論述", "分組鍵", "原文對照", "內容性質"]
EXTRA_FIRST_COLUMN = "AA"
EXTRA_LAST_COLUMN = "AE"
TOPIC_TAGS_FILE = ROOT / "config" / "topic_categories.csv"
# docs/TOPIC-TAXONOMY.md 2026-10-25 定案取消「文化治理與預算」這個大類：
# 文化治理是「政府綜合運用各種工具」的總稱，不該與文化資產、表演藝術並列，
# 實際資料裡它多半被當成總論型政見的通用標籤。這幾個細標籤要重新歸類，
# 在重新歸類完成前先不讓 AI 選，否則總論型政見又會一律掛上去。
EXCLUDED_TOPIC_TAGS = {"文化治理", "文化預算", "法規", "公共參與", "公民參與", "文化生態"}
# 正文與模型結果的本機快取（tmp/ 不進版本庫）。同一則資料重跑時不再重抓、不再重付費；
# 提示詞或 schema 改版時把 PROMPT_VERSION 加一，快取自然失效。
CACHE_DIR = ROOT / "tmp" / "pipeline-cache"
PROMPT_VERSION = "2026-10-26-4"
KIND_LABELS = {"candidate": "候選人政見", "civic_call": "民間政策訴求"}
SKIPPED_REANALYZE_LABELS = {"公民政策倡議"}
REANALYZE_BATCH_SIZE = 50
REANALYZE_WORKERS = 10
SHEETS_MAX_RETRIES = 5
GOOGLE_NEWS_HOSTS = {"news.google.com", "news.google.com.tw"}
GOOGLE_NEWS_ENTRY_MARKERS = (
    "default_DotsSplashUi",
    "data-n-a-sg=",
    "garturlreq",
    "Copyright The Closure Library Authors",
)


def cache_path(kind, key):
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    return CACHE_DIR / kind / f"{digest}.json"


def cache_read(kind, key):
    path = cache_path(kind, key)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def cache_write(kind, key, value):
    path = cache_path(kind, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def topic_tags():
    """可選的議題標籤：沿用 config/topic_categories.csv 裡出現過兩次以上的標籤。

    讓 AI 從固定清單選，不要再自由填：既有資料已經有 150 種寫法、其中一半
    只出現過一次（族語／族語傳承、圖書館／圖書館與閱讀這類同義分歧）。
    """
    with TOPIC_TAGS_FILE.open(encoding="utf-8-sig", newline="") as source:
        return [row["tag"] for row in csv.DictReader(source)
                if int(row["uses"] or 0) >= 2 and row["tag"] not in EXCLUDED_TOPIC_TAGS]


class ArticleFetchError(ValueError):
    pass


def worksheet():
    if not SPREADSHEET_ID:
        raise RuntimeError("缺少 GOOGLE_REVIEW_SPREADSHEET_ID")
    credentials = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    return gspread.service_account_from_dict(credentials).open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)


def fetch_article_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 Culture Governance Observer/1.0"})
    with urlopen(request, timeout=20) as response:
        raw = response.read(400_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
    import re
    raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", raw, flags=re.I)
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", raw)).strip()[:12000]
    if not text:
        raise ValueError("正文擷取結果為空")
    return text


def validate_reanalyze_source(url: str, text: str | None = None) -> None:
    if urlparse(url).hostname in GOOGLE_NEWS_HOSTS:
        raise ArticleFetchError("網址未解析，待解析後重抓")
    if text is None:
        return
    if len(text.strip()) < 200 or any(marker in text for marker in GOOGLE_NEWS_ENTRY_MARKERS):
        raise ArticleFetchError("正文過短，疑為入口頁或付費牆")


def article_text(url: str) -> str:
    cached = cache_read("article", url)
    if cached:
        return cached["text"]
    try:
        text = fetch_article_text(url)
    except Exception as exc:
        return f"（正文擷取失敗：{type(exc).__name__}；請依標題與網址初判）"
    cache_write("article", url, {"text": text})
    return text


def analysis_prompt(kind, row, body, tags):
    return f"""你是臺灣地方文化政策資料編輯。只根據提供的標題與正文整理，不得臆測。
資料類型：{kind}\n縣市：{row['city']}\n標題：{row['source_title']}\n網址：{row['source_url']}\n正文：{body}
判斷是否為具體的候選人文化政策，或民間／團體向政府提出的文化政策訴求。一般活動、事故、純藝文新聞、中央層級且無地方主張者應判為非政策。

撰寫 summary 與 policy_or_request 時：
- 沿用原文的用詞與句子，不改寫、不調語序，不補原文沒有的效果或形容。
- 原文若列出具體項目（例如「六大文化政見」「三項計畫」「四大主張」），summary 必須把那幾項逐一列出，不得只寫「提出六大文化政見」而略過項目內容。
- policy_or_request 逐項列出具體主張，照抄原句，每項之間用 || 分隔（前台會依 || 拆成多條）。
- 含預算金額、期程、地點、場館或計畫名稱的句子不得省略或改寫。
- 一則報導若包含兩位以上候選人或提出者的政見，actor 只填主要對象，summary 與 policy_or_request 只寫該對象的內容，不要把其他人的政見併進來；並在 reason 開頭寫「本則另含：○○、○○」，提醒審核者使用拆分功能。
- concrete_proposals 一項放一個完整的主張。**不要為了湊分點而拆句**：同一個主張的前後句（例「第一，是成立『族群關係處』」與其後的說明）要放在同一項。每一項只放提出者自己的主張。**不得輸出報導的敘事句**（誰、幾月幾號、在哪裡舉行記者會、某某表示、某某指出）；主張本身照抄來源原句，不改寫、不調語序，超過 80 字才以整段子句為單位刪減，刪掉處標「……」。
- 只輸出文化相關的主張。交通、醫療、社福、產業園區、運動設施等非文化內容不要列入 concrete_proposals；整則都不是文化政策時，is_relevant 填 false，仍要填 summary 與 reason，由審核者判斷。
- source_sentences 與 concrete_proposals 等長，逐項放該主張所依據的來源整句原文（不刪減），供審核者對照。
- policy_title 只填來源自己命名的政見名稱（例「文化旗艦．魅力臺中」「五大客家政策」），來源沒有命名就留空字串，不要自創。
- policy_argument 放整體論述一句，來源沒有就留空字串。
- nature 區分語境：候選人承諾未來要做的事填「本屆競選政見」；現任首長或議員敘述任內已完成或正在做的事（例「市府已將客語繪本改編為動畫、累計獲得 13 項國際獎項」）填「現任施政成果」；其餘填「其他」。同一則若兩種都有，concrete_proposals 只放承諾未來要做的，已完成的成果放 policy_argument。
- event_key 不得留空，也不得包含日期（同一場發布會的不同報導日期不同，帶日期就分不到同一組）。用「提出者姓名＋政見名稱」組成、去掉標點與空白（例「江啟臣文化旗艦魅力臺中」）；同一場發布會的不同報導必須得到相同的 event_key。沒有政見名稱時改用「姓名＋主要主張的關鍵詞」。
- topics 從下列清單挑 1 至 5 個，不得自創：{'、'.join(tags)}。
- office 只能填「縣市長」「縣轄市長」「縣市議員」「不適用」。「縣轄市長」指竹北、頭份、苗栗、彰化、員林、南投、斗六、太保、朴子、屏東、宜蘭、花蓮、臺東、馬公 14 個縣轄市的市長；鄉長、鎮長與鄉鎮市民代表不在收錄範圍，office 填「不適用」並在 reason 寫明實際職務。
"""


def analyze(client: OpenAI, kind: str, row: dict[str, str], use_cache: bool = True) -> dict:
    body = row.get("_article_text") or article_text(row["source_url"])
    tags = topic_tags()
    # 同一篇正文、同一版提示詞只付一次錢；中途失敗或重跑都直接讀快取
    key = "\n".join([PROMPT_VERSION, kind, row["source_url"], hashlib.sha256(body.encode("utf-8")).hexdigest()])
    if use_cache:
        cached = cache_read("analysis", key)
        if cached:
            return cached
    prompt = analysis_prompt(kind, row, body, tags)
    response = client.responses.create(
        model=os.environ.get("OPENAI_REVIEW_MODEL", "gpt-5-mini"),
        input=prompt,
        text={"format": {"type": "json_schema", "name": "policy_review", "strict": True, "schema": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "is_relevant": {"type": "boolean"}, "summary": {"type": "string"},
                "reason": {"type": "string"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "actor": {"type": "string"}, "actor_type": {"type": "string"},
                "office": {"type": "string", "enum": ["縣市長", "縣轄市長", "縣市議員", "不適用"]},
                "policy_or_request": {"type": "string"},
                "policy_title": {"type": "string"},
                "policy_argument": {"type": "string"},
                "concrete_proposals": {"type": "array", "items": {"type": "string"}},
                "source_sentences": {"type": "array", "items": {"type": "string"}},
                "topics": {"type": "array", "items": {"type": "string", "enum": tags}},
                "event_key": {"type": "string"},
                "nature": {"type": "string", "enum": ["本屆競選政見", "現任施政成果", "其他"]}
            },
            "required": ["is_relevant", "summary", "reason", "confidence", "actor", "actor_type", "office",
                         "policy_or_request", "policy_title", "policy_argument", "concrete_proposals",
                         "source_sentences", "topics", "event_key", "nature"]
        }}},
    )
    result = json.loads(response.output_text)
    cache_write("analysis", key, result)
    return result


def ai_columns(ai):
    """AI 結果 → Sheet 既有欄位（分類、政策主張）與新增欄位（AA:AD）。"""
    proposals = [x.strip() for x in ai.get("concrete_proposals", []) if x.strip()] or \
        [x.strip() for x in (ai.get("policy_or_request") or "").split("||") if x.strip()]
    # 不退回舊的 category：那是自由字串，2026-10-26 首批重跑時把 candidate 寫進了 AI分類欄
    topics = "|".join(dict.fromkeys(ai.get("topics", [])))
    key = (ai.get("event_key") or "").strip()
    # 分組鍵不能帶日期：同一場發布會的不同報導日期不同，帶了就分不到同一組
    # （2026-10-26 的 206 列裡有 107 列帶日期，180 組中 162 組只有一列）
    key = re.sub(r"\d{4}[-/年]?\d{1,2}[-/月]?\d{1,2}日?", "", key).strip()
    if not key:
        # 模型偶爾留空；用姓名＋政見名稱（或第一項主張）補上，同一場發布會仍能歸在一起
        base = ai.get("policy_title") or (proposals[0][:12] if proposals else "")
        key = re.sub(r"[^\w\u4e00-\u9fff]", "", f"{ai.get('actor', '')}{base}")
    extra = [ai.get("policy_title", ""), ai.get("policy_argument", ""), key,
             "||".join(x.strip() for x in ai.get("source_sentences", []) if x.strip()),
             ai.get("nature", "")]
    return topics, "||".join(proposals), extra


def ensure_extra_headers(ws, values):
    """新增欄位的標題列只寫一次；A:T 是審核台的契約，完全不動。"""
    header = values[0] if values else []
    first = len(HEADERS) + 6  # A:T 之後還有 U:Z 六欄
    if header[first:first + len(EXTRA_HEADERS)] == EXTRA_HEADERS:
        return
    ws.update(range_name=f"{EXTRA_FIRST_COLUMN}1:{EXTRA_LAST_COLUMN}1", values=[EXTRA_HEADERS],
              value_input_option="USER_ENTERED")
    print(f"已補上新增欄位標題 {EXTRA_FIRST_COLUMN}1:{EXTRA_LAST_COLUMN}1", flush=True)


def last_data_row(values):
    """最後一列有網址的資料列；尾端的空白列不算。"""
    return max((number for number, row in enumerate(values[1:], start=2) if len(row) > 6 and row[6].strip()), default=1)


def append_to_sheet(ws, start, output):
    """寫入新列並讀回驗證。

    不用 ws.append_rows()：那張工作表有大量預先格式化的空白列（2026-10-26 時
    資料到第 1398 列、工作表有 1605 列），append API 判斷「表格結尾」會出錯，
    回報成功、列數增加，但資料沒有落在任何一列，是會靜默掉資料的寫法。
    改成自己算出第一個空白列，寫固定範圍，再讀回確認網址真的在表上。
    """
    device = f"{os.environ.get('COMPUTERNAME') or os.environ.get('HOSTNAME') or 'UNKNOWN'}-Codex"
    completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
    # 一般模式原本不填 U/V/X，審核台會看到空白的處理狀態；一併補上。
    rows = [list(row[:20]) + ["complete", device, "", completed_at, "", ""] + list(row[20:]) for row in output]
    end = start + len(rows) - 1
    needed = end - ws.row_count
    if needed > 0:
        ws.add_rows(needed)
    # gspread 5 與 6 的參數順序不同，一律用關鍵字呼叫
    ws.update(range_name=f"A{start}:{EXTRA_LAST_COLUMN}{end}", values=rows, value_input_option="USER_ENTERED")
    written = ws.get(f"G{start}:G{end}")
    landed = {row[0].strip() for row in written if row and row[0].strip()}
    expected = {row[6].strip() for row in output}
    missing = expected - landed
    if missing:
        raise SystemExit(f"寫入後驗證失敗：{len(missing)} 筆未落在 A{start}:{EXTRA_LAST_COLUMN}{end}，請勿重跑前先檢查工作表")
    print(f"已寫入並驗證 A{start}:{EXTRA_LAST_COLUMN}{end}（{len(rows)} 列）", flush=True)
    return end


def inbox_rows():
    for filename, kind in (("candidate_sources.csv", "candidate"),
                           ("councilor_sources.csv", "candidate"),
                           ("civic_policy_calls.csv", "civic_call")):
        with (ROOT / "data" / "inbox" / filename).open(encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                if row.get("review_status") == "pending":
                    yield kind, row


def append_pending_without_analysis(ws, filename):
    """把單一 inbox 的 pending 列送入 Sheet，AI 欄位留空供 --export-pending 使用。"""
    path = ROOT / "data" / "inbox" / filename
    if path.parent != ROOT / "data" / "inbox" or not path.exists():
        raise SystemExit(f"找不到 inbox：{filename}")
    values = ws.get_all_values()
    if not values or values[0][:len(HEADERS)] != HEADERS:
        raise SystemExit("Google Sheet 欄位不符，停止寫入")
    ensure_extra_headers(ws, values)
    existing = {row[6].strip() for row in values[1:] if len(row) > 6 and row[6].strip()}
    output = []
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row.get("review_status") != "pending" or row.get("source_url", "").strip() in existing:
                continue
            output.append(["候選人政見", row["collected_at"], row["city"], row["published_date"],
                           row["source_name"], row["source_title"], row["source_url"], "pending",
                           "", "", "", "", "", "", "", "", row.get("review_note", ""), "", "", "",
                           "", "", "", "", ""])
            existing.add(row["source_url"].strip())
    if output:
        append_to_sheet(ws, last_data_row(values) + 1, output)
    print(f"Google review sheet pending append: appended={len(output)}", flush=True)


def sheets_batch_update_with_retry(ws, updates: list[dict]) -> None:
    for attempt in range(SHEETS_MAX_RETRIES + 1):
        try:
            ws.batch_update(updates, value_input_option="USER_ENTERED")
            return
        except APIError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status != 429 or attempt >= SHEETS_MAX_RETRIES:
                raise
            delay = 2 ** attempt
            print(f"Google Sheets 429; retrying in {delay}s ({attempt + 1}/{SHEETS_MAX_RETRIES})", flush=True)
            time.sleep(delay)


REQUIRED_RESULT_FIELDS = ("is_relevant", "summary", "reason", "confidence", "actor", "actor_type", "office",
                          "policy_title", "policy_argument", "concrete_proposals", "source_sentences",
                          "topics", "event_key", "nature")
OFFICE_VALUES = ("縣市長", "縣轄市長", "縣市議員", "不適用")
NATURE_VALUES = ("本屆競選政見", "現任施政成果", "其他")
EXPORT_BODY_LIMIT = 8000  # 3000 字會切掉報導後段的政見（2026-10-26 試跑時 1419、1421 都剛好截斷）


def pending_candidates(values, columns, row_numbers, force, offset, limit, include_accepted=False):
    """挑出要分析的列：待審、且（摘要空白或 --force）。回傳 (列號, 該列, kind, row)。"""
    kind_by_label = {label: kind for kind, label in KIND_LABELS.items()}
    picked, matched = [], 0
    for number, current in enumerate(values[1:], start=2):
        current = current + [""] * (len(values[0]) - len(current))
        if row_numbers is not None and number not in row_numbers:
            continue
        status = current[columns["審核狀態"]]
        if status != "pending" and not (include_accepted and status == "accepted"):
            continue
        if not force and current[columns["AI摘要"]].strip():
            continue
        if current[columns["資料類型"]] in SKIPPED_REANALYZE_LABELS:
            continue
        matched += 1
        # matched 要數完整個工作表，不能挑滿 limit 就 break，否則回報的總數會偏低
        if matched <= offset or (limit is not None and len(picked) >= limit):
            continue
        picked.append((number, current, kind_by_label.get(current[columns["資料類型"]]), {
            "city": current[columns["縣市"]],
            "source_title": current[columns["來源標題"]],
            "source_url": current[columns["來源網址"]],
        }))
    return picked, matched


def export_pending(ws, path: Path, row_numbers, force, offset, limit, body_limit=EXPORT_BODY_LIMIT, include_accepted=False):
    """把待分析的列連同正文寫成 JSONL，交給不經 OpenAI API 的分析者（例如 Codex）。"""
    values = ws.get_all_values()
    columns = {name: index for index, name in enumerate(values[0])}
    picked, matched = pending_candidates(values, columns, row_numbers, force, offset, limit, include_accepted)
    tags = topic_tags()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as out:
        for number, _current, kind, row in picked:
            full = article_text(row["source_url"])
            body = full[:body_limit]
            truncated = len(full) > body_limit
            out.write(json.dumps({"row": number, "kind": kind, "city": row["city"],
                                  "source_title": row["source_title"], "source_url": row["source_url"],
                                  "article_text": body, "truncated": truncated,
                                  "article_length": len(full)}, ensure_ascii=False) + "\n")
    rules = path.with_suffix(".prompt.md")
    sample = picked[0] if picked else (0, [], "candidate", {"city": "", "source_title": "", "source_url": ""})
    rules.write_text(
        "# 分析規則（由 scripts/google_review_pipeline.py 產生，與 API 版本同一份）\n\n"
        "逐列讀 JSONL，每列輸出一個 JSON 物件，欄位與規則如下；輸出另存成 JSONL，每行一個物件，"
        "並保留原本的 row 欄位。\n\n```\n"
        + analysis_prompt(sample[2] or "candidate", sample[3], "（這裡會放每一列的 article_text）", tags)
        + "\n```\n\n必填欄位：" + "、".join(REQUIRED_RESULT_FIELDS) + "、row。\n"
        "- concrete_proposals 與 source_sentences 必須等長。\n"
        "- topics 只能從上面清單選，1 到 5 個。\n"
        "- office 只能是：" + "、".join(OFFICE_VALUES) + "。\n"
        "- nature 只能是：" + "、".join(NATURE_VALUES) + "。\n"
        "- confidence 是 0 到 1 的數字。\n", encoding="utf-8")
    print(f"已匯出 {len(picked)} 列到 {path}（符合條件共 {matched} 列），規則寫在 {rules.name}", flush=True)


def validate_result(item, tags):
    missing = [field for field in REQUIRED_RESULT_FIELDS if field not in item]
    if missing:
        return f"缺欄位：{'、'.join(missing)}"
    if not isinstance(item["concrete_proposals"], list) or not isinstance(item["source_sentences"], list):
        return "concrete_proposals 與 source_sentences 必須是陣列"
    if len(item["concrete_proposals"]) != len(item["source_sentences"]):
        return f"concrete_proposals（{len(item['concrete_proposals'])}）與 source_sentences（{len(item['source_sentences'])}）長度不一致"
    unknown = [tag for tag in item["topics"] if tag not in tags]
    if unknown:
        return f"topics 不在清單內：{'、'.join(unknown)}"
    if item["office"] not in OFFICE_VALUES:
        return f"office 不合法：{item['office']}"
    if item["nature"] not in NATURE_VALUES:
        return f"nature 不合法：{item['nature']}"
    return ""


def import_results(ws, path: Path):
    """把外部分析結果寫回 Sheet；先全部驗證，有一列不合格就整批不寫。"""
    values = ws.get_all_values()
    columns = {name: index for index, name in enumerate(values[0])}
    tags = set(topic_tags())
    device = f"{os.environ.get('COMPUTERNAME') or os.environ.get('HOSTNAME') or 'UNKNOWN'}-Codex"
    completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
    items, problems = [], []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            problems.append(f"第 {line_number} 行不是合法 JSON：{exc}")
            continue
        number = item.get("row")
        if not isinstance(number, int) or number < 2 or number > len(values):
            problems.append(f"第 {line_number} 行的 row 不合法：{number}")
            continue
        error = validate_result(item, tags)
        if error:
            problems.append(f"列 {number}：{error}")
            continue
        items.append((number, item))
    if problems:
        raise SystemExit("驗證未通過，整批不寫入：\n" + "\n".join(problems))
    updates = []
    for number, ai in items:
        current = values[number - 1] + [""] * (len(values[0]) - len(values[number - 1]))
        note = current[columns["人工備註"]] or ("AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else "")
        topics, proposals, extra = ai_columns(ai)
        if current[columns["審核狀態"]] == "accepted":
            # 已經人工審核過：候選人、政黨、職務、人工備註是審核者填的，不覆蓋
            updates.append({"range": f"I{number}:L{number}", "values": [[ai["summary"], topics, ai["reason"], ai["confidence"]]]})
            updates.append({"range": f"P{number}", "values": [[proposals]]})
        else:
            updates.append({"range": f"I{number}:Q{number}", "values": [[ai["summary"], topics, ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], proposals, note]]})
        updates.append({"range": f"U{number}:V{number}", "values": [["complete", device]]})
        updates.append({"range": f"X{number}:Y{number}", "values": [[completed_at, ""]]})
        updates.append({"range": f"{EXTRA_FIRST_COLUMN}{number}:{EXTRA_LAST_COLUMN}{number}", "values": [extra]})
    if updates:
        sheets_batch_update_with_retry(ws, updates)
    print(f"已寫回 {len(items)} 列（{path.name}）", flush=True)


def reanalyze_sheet(ws, client: OpenAI, limit: int | None, row_numbers: set[int] | None = None, force: bool = False, offset: int = 0, include_accepted: bool = False) -> None:
    values = ws.get_all_values()
    if not values or values[0][:len(HEADERS)] != HEADERS:
        raise SystemExit("Google Sheet 欄位不符，停止寫入")
    columns = {name: index for index, name in enumerate(values[0])}
    required = set(HEADERS) | {"AI處理狀態", "處理者／裝置", "AI完成時間", "AI錯誤"}
    missing = sorted(required - columns.keys())
    if missing:
        raise SystemExit(f"Google Sheet 缺少欄位：{', '.join(missing)}")
    kind_by_label = {label: kind for kind, label in KIND_LABELS.items()}
    device = f"{os.environ.get('COMPUTERNAME') or os.environ.get('HOSTNAME') or 'UNKNOWN'}-Codex"
    attempted = completed = failed = skipped = matched = 0
    pending_updates = []
    pending_results = []

    def flush_updates() -> None:
        nonlocal pending_updates, pending_results
        if not pending_updates:
            return
        sheets_batch_update_with_retry(ws, pending_updates)
        for number, status, error in pending_results:
            print(f"row={number} {status}" + (f" error={error}" if error else ""), flush=True)
        pending_updates = []
        pending_results = []

    candidates = []
    for number, current in enumerate(values[1:], start=2):
        current += [""] * (len(values[0]) - len(current))
        if row_numbers is not None and number not in row_numbers:
            continue
        status = current[columns["審核狀態"]]
        if status != "pending" and not (include_accepted and status == "accepted"):
            continue
        # --force：換過提示詞之後要重跑已經分析完的列，這時不看「摘要是否已填」
        if not force and current[columns["AI摘要"]].strip():
            continue
        if current[columns["資料類型"]] in SKIPPED_REANALYZE_LABELS:
            skipped += 1
            continue
        # --offset：--force 之後「摘要已填」不再是排除條件，只靠 --limit 每次都會挑到同一批，
        # 要用 offset 位移才能分批把全部跑完（或改用 --rows 指定區間）。
        matched += 1
        if matched <= offset:
            continue
        if limit is not None and attempted >= limit:
            break
        attempted += 1
        kind = kind_by_label.get(current[columns["資料類型"]])
        row = {
            "city": current[columns["縣市"]],
            "source_title": current[columns["來源標題"]],
            "source_url": current[columns["來源網址"]],
        }
        candidates.append((number, current, kind, row))

    def process_candidate(candidate):
        number, current, kind, row = candidate
        try:
            if not kind:
                raise ValueError(f"不支援的資料類型：{current[columns['資料類型']] or '空白'}")
            validate_reanalyze_source(row["source_url"])
            row["_article_text"] = fetch_article_text(row["source_url"])
            validate_reanalyze_source(row["source_url"], row["_article_text"])
            ai = analyze(client, kind, row)
            note = current[columns["人工備註"]] or ("AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else "")
            completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
            topics, proposals, extra = ai_columns(ai)
            if current[columns["審核狀態"]] == "accepted":
                # 已經人工審核過：候選人、政黨、職務、人工備註是審核者填的，不覆蓋，
                # 只更新 AI 自己產出的摘要、分類、理由、信心與具體主張。
                updates = [
                    {"range": f"I{number}:L{number}", "values": [[ai["summary"], topics, ai["reason"], ai["confidence"]]]},
                    {"range": f"P{number}", "values": [[proposals]]},
                ]
            else:
                updates = [
                    {"range": f"I{number}:Q{number}", "values": [[ai["summary"], topics, ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], proposals, note]]},
                ]
            updates += [
                {"range": f"U{number}:V{number}", "values": [["complete", device]]},
                {"range": f"X{number}:Y{number}", "values": [[completed_at, ""]]},
                {"range": f"{EXTRA_FIRST_COLUMN}{number}:{EXTRA_LAST_COLUMN}{number}", "values": [extra]},
            ]
            return number, "complete", "", updates
        except Exception as exc:
            error = str(exc) if isinstance(exc, ArticleFetchError) else f"{type(exc).__name__}: {exc}"
            completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
            updates = [
                {"range": f"I{number}:Q{number}", "values": [[""] * 9]},
                {"range": f"U{number}:V{number}", "values": [["error", device]]},
                {"range": f"X{number}:Y{number}", "values": [[completed_at, error]]},
            ]
            return number, "error", error, updates

    if candidates:
        with ThreadPoolExecutor(max_workers=min(REANALYZE_WORKERS, len(candidates))) as executor:
            futures = [executor.submit(process_candidate, candidate) for candidate in candidates]
            for future in as_completed(futures):
                number, status, error, updates = future.result()
                pending_updates.extend(updates)
                pending_results.append((number, status, error))
                if status == "complete":
                    completed += 1
                else:
                    failed += 1
                if len(pending_results) >= REANALYZE_BATCH_SIZE:
                    flush_updates()
    flush_updates()
    print(f"Google review sheet reanalyze: matched={matched}, offset={offset}, attempted={attempted}, completed={completed}, failed={failed}, skipped={skipped}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reanalyze", action="store_true", help="重新分析 Sheet 上待審且 AI 摘要為空的既有列")
    parser.add_argument("--limit", type=int, help="最多處理幾列（僅適用 --reanalyze）")
    parser.add_argument("--rows", help="只處理指定 Sheet 列號，以逗號分隔，可用區間如 1399-1418（僅適用 --reanalyze）")
    parser.add_argument("--force", action="store_true", help="連 AI 摘要已填的列也重跑（僅適用 --reanalyze，換提示詞後重新分析用）")
    parser.add_argument("--offset", type=int, default=0, help="跳過前幾列符合條件的列再開始（僅適用 --reanalyze，搭配 --limit 分批）")
    parser.add_argument("--export-pending", metavar="FILE", help="把待分析的列連同正文匯出成 JSONL，交給不經 OpenAI API 的分析者")
    parser.add_argument("--include-accepted", action="store_true", help="連已接受的列也處理（重跑時不覆蓋候選人、政黨、職務、人工備註這四個人工審核過的欄位）")
    parser.add_argument("--body-limit", type=int, default=EXPORT_BODY_LIMIT, help=f"匯出時每則正文的字數上限（預設 {EXPORT_BODY_LIMIT}）")
    parser.add_argument("--import-results", metavar="FILE", help="把外部分析結果（JSONL）驗證後寫回 Sheet")
    parser.add_argument("--append-pending", metavar="INBOX_FILE", help="不呼叫模型，只把指定 inbox 的 pending 列送入 Sheet")
    parser.add_argument("--chunk", type=int, default=20, help="一般模式每幾列寫一次 Sheet（預設 20），桌面版跑長指令時調小比較看得到進度")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit 必須大於 0")
    if args.limit is not None and not (args.reanalyze or args.export_pending):
        parser.error("--limit 只能搭配 --reanalyze")
    if args.rows and not (args.reanalyze or args.export_pending):
        parser.error("--rows 只能搭配 --reanalyze")
    if args.force and not (args.reanalyze or args.export_pending):
        parser.error("--force 只能搭配 --reanalyze")
    if args.chunk < 1:
        parser.error("--chunk 必須大於 0")
    if args.offset and not (args.reanalyze or args.export_pending):
        parser.error("--offset 只能搭配 --reanalyze 或 --export-pending")
    if sum(bool(value) for value in (args.export_pending, args.import_results, args.append_pending)) > 1:
        parser.error("--export-pending、--import-results、--append-pending 不能同時使用")
    if args.offset < 0:
        parser.error("--offset 不可為負數")
    def parse_rows(text):
        numbers = set()
        for part in text.split(","):
            part = part.strip()
            if not part:
                continue
            if "-" in part:  # 區間：1399-1418
                start, _, end = part.partition("-")
                first, last = int(start), int(end)
                if last < first:
                    raise ValueError(part)
                numbers.update(range(first, last + 1))
            else:
                numbers.add(int(part))
        return numbers

    try:
        row_numbers = parse_rows(args.rows) if args.rows else None
    except ValueError:
        parser.error("--rows 必須是列號或區間，以逗號分隔（例 1399,1401,1410-1420）")
    if row_numbers and min(row_numbers) < 2:
        parser.error("--rows 列號必須大於等於 2")
    ws = worksheet()
    # 匯出／匯入完全不碰模型，不要求 OPENAI_API_KEY
    if args.append_pending:
        append_pending_without_analysis(ws, args.append_pending)
        return
    if args.export_pending:
        export_pending(ws, Path(args.export_pending), row_numbers, args.force, args.offset, args.limit, args.body_limit, args.include_accepted)
        return
    if args.import_results:
        ensure_extra_headers(ws, ws.get_all_values())
        import_results(ws, Path(args.import_results))
        return
    client = OpenAI()
    if args.reanalyze:
        ensure_extra_headers(ws, ws.get_all_values())
        reanalyze_sheet(ws, client, args.limit, row_numbers, force=args.force, offset=args.offset, include_accepted=args.include_accepted)
        return
    chunk = args.chunk
    values = ws.get_all_values()
    if not values or values[0][:len(HEADERS)] != HEADERS:
        raise SystemExit("Google Sheet 欄位不符，停止寫入")
    ensure_extra_headers(ws, values)
    existing = {row[6].strip(): (number, row) for number, row in enumerate(values[1:], start=2) if len(row) > 6 and row[6].strip()}
    output = []
    backfill = []
    skipped = 0
    appended = 0
    next_row = last_data_row(values) + 1

    def flush(force=False):
        """每累積 chunk 列就寫一次，並印出列號。

        桌面版 Codex 跑長指令時常吞掉緩衝輸出，而且一次寫到最後才落盤的話，
        中途失敗整輪就白跑（2026-10-26 曾因此損失 130 列的分析）。
        """
        nonlocal output, next_row, appended
        if not output or (not force and len(output) < chunk):
            return
        next_row = append_to_sheet(ws, next_row, output) + 1
        appended += len(output)
        output = []

    for kind, row in inbox_rows():
        if row["source_url"] in existing:
            number, current = existing[row["source_url"]]
            current += [""] * (len(HEADERS) - len(current))
            if current[7] == "pending" and not current[8].strip():
                ai = analyze(client, kind, row)
                note = current[16] or ("AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else "")
                topics, proposals, extra = ai_columns(ai)
                backfill.append({"range": f"I{number}:Q{number}", "values": [[ai["summary"], topics, ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], proposals, note]]})
                backfill.append({"range": f"{EXTRA_FIRST_COLUMN}{number}:{EXTRA_LAST_COLUMN}{number}", "values": [extra]})
            else:
                skipped += 1
            continue
        ai = analyze(client, kind, row)
        # AI supplies an opinion, but only the human reviewer changes the status.
        status = "pending"
        note = "AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else ""
        topics, proposals, extra = ai_columns(ai)
        output.append([KIND_LABELS[kind], row["collected_at"], row["city"], row["published_date"], row["source_name"], row["source_title"], row["source_url"], status, ai["summary"], topics, ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], proposals, note, "", "", ""] + extra)
        existing[row["source_url"]] = (0, [])
        flush()
    flush(force=True)
    if backfill:
        ws.batch_update(backfill, value_input_option="USER_ENTERED")
    print(f"Google review sheet: appended={appended}, AI_backfilled={len(backfill)}, already_complete={skipped}", flush=True)


if __name__ == "__main__":
    main()
