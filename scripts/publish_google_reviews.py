#!/usr/bin/env python3
"""Publish accepted Google Sheet reviews into the site's canonical CSV files."""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path

import gspread

ROOT = Path(__file__).resolve().parents[1]
SPREADSHEET_ID = os.environ["GOOGLE_REVIEW_SPREADSHEET_ID"]


def slug(value: str) -> str:
    value = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "-", value).strip("-").lower()
    return value[:48] or "record"


def append_unique(path: Path, record: dict[str, str]) -> tuple[bool, str]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        rows = list(reader)
        fields = reader.fieldnames or []
    for row in rows:
        if row.get("source_url") == record["source_url"]:
            return False, row.get("id", "")
    with path.open("a", encoding="utf-8", newline="") as target:
        csv.DictWriter(target, fieldnames=fields, extrasaction="ignore").writerow(record)
    return True, record["id"]


def main():
    credentials = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    book = gspread.service_account_from_dict(credentials).open_by_key(SPREADSHEET_ID)
    ws = book.worksheet("審核資料")
    rows = ws.get_all_records(default_blank="")
    published = []
    today = date.today().isoformat()
    for number, row in enumerate(rows, start=2):
        if row["審核狀態"] != "accepted":
            continue
        kind = {"候選人政見": "candidate", "民間政策訴求": "civic_call"}.get(row["資料類型"], row["資料類型"])
        digest = hashlib.sha256(str(row["來源網址"]).encode()).hexdigest()[:12]
        identifier = f"{kind}-auto-{digest}"
        common = {"id": identifier, "city": row["縣市"], "topics": row["AI分類"], "summary": row["AI摘要"], "published_date": row["發布日期"], "source_title": row["來源標題"], "source_url": row["來源網址"], "source_type": "新聞／公開網頁", "last_verified": today, "correction_log": row["人工備註"]}
        if kind == "candidate":
            record = common | {"office": row["職務"] or "待確認", "candidate": row["候選人／提出者"], "party": row["政黨／提出者類型"] or "待確認", "policy_argument": row["AI摘要"], "concrete_proposals": row["政策主張／具體訴求"], "related_statements": "", "related_sources": "", "policy_argument_sources": "", "concrete_proposal_sources": "", "related_statement_sources": ""}
            path = ROOT / "data/input/candidates.csv"
        elif kind == "civic_call":
            record = common | {"proposer": row["候選人／提出者"], "proposer_type": row["政黨／提出者類型"] or "其他", "requested_action": row["政策主張／具體訴求"]}
            path = ROOT / "data/input/civic_policy_calls.csv"
        else:
            continue
        _, identifier = append_unique(path, record)
        published.append((number, identifier, kind, row["來源標題"], row["來源網址"]))
    if not published:
        print("No accepted reviews to publish")
        return
    subprocess.run(["python", str(ROOT / "scripts/build_data.py")], check=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    for number, identifier, *_ in published:
        ws.update_cell(number, 8, "published")
        ws.update_cell(number, 19, timestamp)
        ws.update_cell(number, 20, identifier)
    log = book.worksheet("發布紀錄")
    log.append_rows([[timestamp, kind, identifier, title, url, "GitHub Actions", "published", os.environ.get("GITHUB_SHA", "local")] for _, identifier, kind, title, url in published], value_input_option="USER_ENTERED")
    print(f"Published {len(published)} accepted reviews")


if __name__ == "__main__":
    main()
