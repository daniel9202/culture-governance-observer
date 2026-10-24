#!/usr/bin/env python3
"""Append new inbox leads to Google Sheets and enrich them with OpenAI."""
from __future__ import annotations

import argparse
import csv
import json
import os
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

import gspread
from gspread.exceptions import APIError
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
SHEET_NAME = os.environ.get("GOOGLE_REVIEW_SHEET_NAME", "審核資料")
SPREADSHEET_ID = os.environ.get("GOOGLE_REVIEW_SPREADSHEET_ID", "")
HEADERS = ["資料類型", "收集時間", "縣市", "發布日期", "來源名稱", "來源標題", "來源網址", "審核狀態", "AI摘要", "AI分類", "AI判斷理由", "AI信心分數", "候選人／提出者", "政黨／提出者類型", "職務", "政策主張／具體訴求", "人工備註", "審核者", "審核時間", "發布ID"]
KIND_LABELS = {"candidate": "候選人政見", "civic_call": "民間政策訴求"}
SKIPPED_REANALYZE_LABELS = {"公民政策倡議"}
REANALYZE_BATCH_SIZE = 50
SHEETS_MAX_RETRIES = 5


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


def article_text(url: str) -> str:
    try:
        return fetch_article_text(url)
    except Exception as exc:
        return f"（正文擷取失敗：{type(exc).__name__}；請依標題與網址初判）"


def analyze(client: OpenAI, kind: str, row: dict[str, str]) -> dict:
    body = row.get("_article_text") or article_text(row["source_url"])
    prompt = f"""你是臺灣地方文化政策資料編輯。只根據提供的標題與正文整理，不得臆測。
資料類型：{kind}\n縣市：{row['city']}\n標題：{row['source_title']}\n網址：{row['source_url']}\n正文：{body}
判斷是否為具體的候選人文化政策，或民間／團體向政府提出的文化政策訴求。一般活動、事故、純藝文新聞、中央層級且無地方主張者應判為非政策。

撰寫 summary 與 policy_or_request 時：
- 沿用原文的用詞與句子，不改寫、不調語序，不補原文沒有的效果或形容。
- 原文若列出具體項目（例如「六大文化政見」「三項計畫」「四大主張」），summary 必須把那幾項逐一列出，不得只寫「提出六大文化政見」而略過項目內容。
- policy_or_request 逐項列出具體主張，照抄原句，每項之間用 || 分隔（前台會依 || 拆成多條）。
- 含預算金額、期程、地點、場館或計畫名稱的句子不得省略或改寫。
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
                "office": {"type": "string", "enum": ["縣市長", "縣市議員", "不適用"]}, "policy_or_request": {"type": "string"}
            },
            "required": ["is_relevant", "summary", "category", "reason", "confidence", "actor", "actor_type", "office", "policy_or_request"]
        }}},
    )
    return json.loads(response.output_text)


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
            print(f"Google Sheets 429; retrying in {delay}s ({attempt + 1}/{SHEETS_MAX_RETRIES})")
            time.sleep(delay)


def reanalyze_sheet(ws, client: OpenAI, limit: int | None) -> None:
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
            print(f"row={number} {status}" + (f" error={error}" if error else ""))
        pending_updates = []
        pending_results = []

    for number, current in enumerate(values[1:], start=2):
        current += [""] * (len(values[0]) - len(current))
        if current[columns["審核狀態"]] != "pending" or current[columns["AI摘要"]].strip():
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
        try:
            if not kind:
                raise ValueError(f"不支援的資料類型：{current[columns['資料類型']] or '空白'}")
            row["_article_text"] = fetch_article_text(row["source_url"])
            ai = analyze(client, kind, row)
            note = current[columns["人工備註"]] or ("AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else "")
            completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
            pending_updates.extend([
                {"range": f"I{number}:Q{number}", "values": [[ai["summary"], ai["category"], ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], ai["policy_or_request"], note]]},
                {"range": f"U{number}:V{number}", "values": [["complete", device]]},
                {"range": f"X{number}:Y{number}", "values": [[completed_at, ""]]},
            ])
            pending_results.append((number, "complete", ""))
            completed += 1
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
            pending_updates.extend([
                {"range": f"I{number}:Q{number}", "values": [[""] * 9]},
                {"range": f"U{number}:V{number}", "values": [["error", device]]},
                {"range": f"X{number}:Y{number}", "values": [[completed_at, error]]},
            ])
            pending_results.append((number, "error", error))
            failed += 1
        if len(pending_results) >= REANALYZE_BATCH_SIZE:
            flush_updates()
    flush_updates()
    print(f"Google review sheet reanalyze: attempted={attempted}, completed={completed}, failed={failed}, skipped={skipped}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reanalyze", action="store_true", help="重新分析 Sheet 上待審且 AI 摘要為空的既有列")
    parser.add_argument("--limit", type=int, help="最多處理幾列（僅適用 --reanalyze）")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit 必須大於 0")
    if args.limit is not None and not args.reanalyze:
        parser.error("--limit 只能搭配 --reanalyze")
    ws = worksheet()
    client = OpenAI()
    if args.reanalyze:
        reanalyze_sheet(ws, client, args.limit)
        return
    values = ws.get_all_values()
    if not values or values[0][:len(HEADERS)] != HEADERS:
        raise SystemExit("Google Sheet 欄位不符，停止寫入")
    existing = {row[6].strip(): (number, row) for number, row in enumerate(values[1:], start=2) if len(row) > 6 and row[6].strip()}
    output = []
    backfill = []
    skipped = 0
    for kind, row in inbox_rows():
        if row["source_url"] in existing:
            number, current = existing[row["source_url"]]
            current += [""] * (len(HEADERS) - len(current))
            if current[7] == "pending" and not current[8].strip():
                ai = analyze(client, kind, row)
                note = current[16] or ("AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else "")
                backfill.append({"range": f"I{number}:Q{number}", "values": [[ai["summary"], ai["category"], ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], ai["policy_or_request"], note]]})
            else:
                skipped += 1
            continue
        ai = analyze(client, kind, row)
        # AI supplies an opinion, but only the human reviewer changes the status.
        status = "pending"
        note = "AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else ""
        output.append([KIND_LABELS[kind], row["collected_at"], row["city"], row["published_date"], row["source_name"], row["source_title"], row["source_url"], status, ai["summary"], ai["category"], ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], ai["policy_or_request"], note, "", "", ""])
        existing[row["source_url"]] = (0, [])
    if backfill:
        ws.batch_update(backfill, value_input_option="USER_ENTERED")
    if output:
        ws.append_rows(output, value_input_option="USER_ENTERED")
    print(f"Google review sheet: appended={len(output)}, AI_backfilled={len(backfill)}, already_complete={skipped}")


if __name__ == "__main__":
    main()
