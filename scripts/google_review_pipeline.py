#!/usr/bin/env python3
"""Append new inbox leads to Google Sheets and enrich them with OpenAI."""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

import gspread
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
SHEET_NAME = os.environ.get("GOOGLE_REVIEW_SHEET_NAME", "審核資料")
SPREADSHEET_ID = os.environ["GOOGLE_REVIEW_SPREADSHEET_ID"]
HEADERS = ["資料類型", "收集時間", "縣市", "發布日期", "來源名稱", "來源標題", "來源網址", "審核狀態", "AI摘要", "AI分類", "AI判斷理由", "AI信心分數", "候選人／提出者", "政黨／提出者類型", "職務", "政策主張／具體訴求", "人工備註", "審核者", "審核時間", "發布ID"]


def worksheet():
    credentials = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    return gspread.service_account_from_dict(credentials).open_by_key(SPREADSHEET_ID).worksheet(SHEET_NAME)


def article_text(url: str) -> str:
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 Culture Governance Observer/1.0"})
        with urlopen(request, timeout=20) as response:
            raw = response.read(400_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
        import re
        raw = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", raw, flags=re.I)
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", raw))[:12000]
    except Exception as exc:
        return f"（正文擷取失敗：{type(exc).__name__}；請依標題與網址初判）"


def analyze(client: OpenAI, kind: str, row: dict[str, str]) -> dict:
    prompt = f"""你是臺灣地方文化政策資料編輯。只根據提供的標題與正文整理，不得臆測。
資料類型：{kind}\n縣市：{row['city']}\n標題：{row['source_title']}\n網址：{row['source_url']}\n正文：{article_text(row['source_url'])}
判斷是否為具體的候選人文化政策，或民間／團體向政府提出的文化政策訴求。一般活動、事故、純藝文新聞、中央層級且無地方主張者應判為非政策。
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
                "office": {"type": "string"}, "policy_or_request": {"type": "string"}
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


def main():
    ws = worksheet()
    values = ws.get_all_values()
    if not values or values[0][:len(HEADERS)] != HEADERS:
        raise SystemExit("Google Sheet 欄位不符，停止寫入")
    existing = {row[6].strip() for row in values[1:] if len(row) > 6 and row[6].strip()}
    client = OpenAI()
    output = []
    skipped = 0
    for kind, row in inbox_rows():
        if row["source_url"] in existing:
            skipped += 1
            continue
        ai = analyze(client, kind, row)
        # AI supplies an opinion, but only the human reviewer changes the status.
        status = "pending"
        note = "AI 建議排除（仍待人工確認）" if not ai["is_relevant"] else ""
        output.append([kind, row["collected_at"], row["city"], row["published_date"], row["source_name"], row["source_title"], row["source_url"], status, ai["summary"], ai["category"], ai["reason"], ai["confidence"], ai["actor"], ai["actor_type"], ai["office"], ai["policy_or_request"], note, "", "", ""])
        existing.add(row["source_url"])
    if output:
        ws.append_rows(output, value_input_option="USER_ENTERED")
    print(f"Google review sheet: appended={len(output)}, already_present={skipped}")


if __name__ == "__main__":
    main()
