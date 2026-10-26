#!/usr/bin/env python3
"""Append new inbox leads to Google Sheets and enrich them with OpenAI."""
from __future__ import annotations

import argparse
import csv
import json
import os
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
EXTRA_HEADERS = ["政見名稱", "政策論述", "分組鍵", "原文對照"]
EXTRA_FIRST_COLUMN = "AA"
EXTRA_LAST_COLUMN = "AD"
TOPIC_TAGS_FILE = ROOT / "config" / "topic_categories.csv"
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


def topic_tags():
    """可選的議題標籤：沿用 config/topic_categories.csv 裡出現過兩次以上的標籤。

    讓 AI 從固定清單選，不要再自由填：既有資料已經有 150 種寫法、其中一半
    只出現過一次（族語／族語傳承、圖書館／圖書館與閱讀這類同義分歧）。
    """
    with TOPIC_TAGS_FILE.open(encoding="utf-8-sig", newline="") as source:
        return [row["tag"] for row in csv.DictReader(source) if int(row["uses"] or 0) >= 2]


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
    try:
        return fetch_article_text(url)
    except Exception as exc:
        return f"（正文擷取失敗：{type(exc).__name__}；請依標題與網址初判）"


def analyze(client: OpenAI, kind: str, row: dict[str, str]) -> dict:
    body = row.get("_article_text") or article_text(row["source_url"])
    tags = topic_tags()
    prompt = f"""你是臺灣地方文化政策資料編輯。只根據提供的標題與正文整理，不得臆測。
資料類型：{kind}\n縣市：{row['city']}\n標題：{row['source_title']}\n網址：{row['source_url']}\n正文：{body}
判斷是否為具體的候選人文化政策，或民間／團體向政府提出的文化政策訴求。一般活動、事故、純藝文新聞、中央層級且無地方主張者應判為非政策。

撰寫 summary 與 policy_or_request 時：
- 沿用原文的用詞與句子，不改寫、不調語序，不補原文沒有的效果或形容。
- 原文若列出具體項目（例如「六大文化政見」「三項計畫」「四大主張」），summary 必須把那幾項逐一列出，不得只寫「提出六大文化政見」而略過項目內容。
- policy_or_request 逐項列出具體主張，照抄原句，每項之間用 || 分隔（前台會依 || 拆成多條）。
- 含預算金額、期程、地點、場館或計畫名稱的句子不得省略或改寫。
- 一則報導若包含兩位以上候選人或提出者的政見，actor 只填主要對象，summary 與 policy_or_request 只寫該對象的內容，不要把其他人的政見併進來；並在 reason 開頭寫「本則另含：○○、○○」，提醒審核者使用拆分功能。
- concrete_proposals 每一項只放提出者自己的主張。**不得輸出報導的敘事句**（誰、幾月幾號、在哪裡舉行記者會、某某表示、某某指出）；主張本身照抄來源原句，不改寫、不調語序，超過 80 字才以整段子句為單位刪減，刪掉處標「……」。
- 只輸出文化相關的主張。交通、醫療、社福、產業園區、運動設施等非文化內容不要列入 concrete_proposals；整則都不是文化政策時，is_relevant 填 false，仍要填 summary 與 reason，由審核者判斷。
- source_sentences 與 concrete_proposals 等長，逐項放該主張所依據的來源整句原文（不刪減），供審核者對照。
- policy_title 只填來源自己命名的政見名稱（例「文化旗艦．魅力臺中」「五大客家政策」），來源沒有命名就留空字串，不要自創。
- policy_argument 放整體論述一句，來源沒有就留空字串。
- event_key 用「提出者姓名＋政見名稱」組成、去掉標點與空白（例「江啟臣文化旗艦魅力臺中」）；同一場發布會的不同報導必須得到相同的 event_key。沒有政見名稱時改用「姓名＋主要主張的關鍵詞」。
- topics 從下列清單挑 1 至 5 個，不得自創：{'、'.join(tags)}。
- office 只能填「縣市長」「縣轄市長」「縣市議員」「不適用」。「縣轄市長」指竹北、頭份、苗栗、彰化、員林、南投、斗六、太保、朴子、屏東、宜蘭、花蓮、臺東、馬公 14 個縣轄市的市長；鄉長、鎮長與鄉鎮市民代表不在收錄範圍，office 填「不適用」並在 reason 寫明實際職務。
"""
    response = client.responses.create(
        model=os.environ.get("OPENAI_REVIEW_MODEL", "gpt-5-mini"),
        input=prompt,
        text={"format": {"type": "json_schema", "name": "policy_review", "strict": True, "schema": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "is_relevant": {"type": "boolean"}, "summary": {"type": "string"},
                "category": {"type": "string"}, "reason": {"type": "string"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "actor": {"type": "string"}, "actor_type": {"type": "string"},
                "office": {"type": "string", "enum": ["縣市長", "縣轄市長", "縣市議員", "不適用"]},
                "policy_or_request": {"type": "string"},
                "policy_title": {"type": "string"},
                "policy_argument": {"type": "string"},
                "concrete_proposals": {"type": "array", "items": {"type": "string"}},
                "source_sentences": {"type": "array", "items": {"type": "string"}},
                "topics": {"type": "array", "items": {"type": "string", "enum": tags}},
                "event_key": {"type": "string"}
            },
            "required": ["is_relevant", "summary", "category", "reason", "confidence", "actor", "actor_type", "office",
                         "policy_or_request", "policy_title", "policy_argument", "concrete_proposals",
                         "source_sentences", "topics", "event_key"]
        }}},
    )
    return json.loads(response.output_text)


def ai_columns(ai):
    """AI 結果 → Sheet 既有欄位（分類、政策主張）與新增欄位（AA:AD）。"""
    proposals = [x.strip() for x in ai.get("concrete_proposals", []) if x.strip()] or \
        [x.strip() for x in (ai.get("policy_or_request") or "").split("||") if x.strip()]
    topics = "|".join(dict.fromkeys(ai.get("topics", []))) or ai.get("category", "")
    extra = [ai.get("policy_title", ""), ai.get("policy_argument", ""), ai.get("event_key", ""),
             "||".join(x.strip() for x in ai.get("source_sentences", []) if x.strip())]
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
    for filename, kind in (("candidate_sources.csv", "candidate"), ("civic_policy_calls.csv", "civic_call")):
        with (ROOT / "data" / "inbox" / filename).open(encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                if row.get("review_status") == "pending":
                    yield kind, row


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


def reanalyze_sheet(ws, client: OpenAI, limit: int | None, row_numbers: set[int] | None = None, force: bool = False) -> None:
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
    attempted = completed = failed = skipped = 0
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
        # --force：換過提示詞之後要重跑已經分析完的列，這時不看「摘要是否已填」
        if current[columns["審核狀態"]] != "pending" or (not force and current[columns["AI摘要"]].strip()):
            continue
        if current[columns["資料類型"]] in SKIPPED_REANALYZE_LABELS:
            skipped += 1
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
            updates = [
                {"range": f"I{number}:Q{number}", "values": [[ai["summary"], topics, ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], proposals, note]]},
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
    print(f"Google review sheet reanalyze: attempted={attempted}, completed={completed}, failed={failed}, skipped={skipped}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reanalyze", action="store_true", help="重新分析 Sheet 上待審且 AI 摘要為空的既有列")
    parser.add_argument("--limit", type=int, help="最多處理幾列（僅適用 --reanalyze）")
    parser.add_argument("--rows", help="只處理指定 Sheet 列號，以逗號分隔（僅適用 --reanalyze）")
    parser.add_argument("--force", action="store_true", help="連 AI 摘要已填的列也重跑（僅適用 --reanalyze，換提示詞後重新分析用）")
    parser.add_argument("--chunk", type=int, default=20, help="一般模式每幾列寫一次 Sheet（預設 20），桌面版跑長指令時調小比較看得到進度")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit 必須大於 0")
    if args.limit is not None and not args.reanalyze:
        parser.error("--limit 只能搭配 --reanalyze")
    if args.rows and not args.reanalyze:
        parser.error("--rows 只能搭配 --reanalyze")
    if args.force and not args.reanalyze:
        parser.error("--force 只能搭配 --reanalyze")
    if args.chunk < 1:
        parser.error("--chunk 必須大於 0")
    try:
        row_numbers = {int(value) for value in args.rows.split(",")} if args.rows else None
    except ValueError:
        parser.error("--rows 必須是以逗號分隔的整數列號")
    if row_numbers and min(row_numbers) < 2:
        parser.error("--rows 列號必須大於等於 2")
    ws = worksheet()
    client = OpenAI()
    if args.reanalyze:
        ensure_extra_headers(ws, ws.get_all_values())
        reanalyze_sheet(ws, client, args.limit, row_numbers, force=args.force)
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
