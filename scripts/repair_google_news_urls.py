#!/usr/bin/env python3
"""Resolve pending Google News review URLs and update matching inbox rows atomically."""
from __future__ import annotations

import argparse
import csv
import json
import re
import tempfile
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

from google_news_urls import is_google_news_url, resolve

ROOT = Path(__file__).resolve().parents[1]
INBOXES = (ROOT / "data/inbox/candidate_sources.csv", ROOT / "data/inbox/civic_policy_calls.csv")
REPORT = ROOT / "data/research/google_news_url_resolution.json"


def spreadsheet_id() -> str:
    source = (ROOT / "apps-script/Code.gs").read_text(encoding="utf-8")
    match = re.search(r"^const SPREADSHEET_ID = '([^']+)'", source, re.M)
    if not match:
        raise RuntimeError("Code.gs 找不到 SPREADSHEET_ID")
    return match.group(1)


def pending_sheet_urls() -> list[dict[str, str | int]]:
    query = urllib.parse.urlencode({"tqx": "out:csv", "sheet": "審核資料"})
    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id()}/gviz/tq?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "Culture Governance Observer/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8-sig")
    rows = list(csv.DictReader(text.splitlines()))
    return [
        {
            "sheet_export_position": number,
            "url": row.get("來源網址", ""),
            "city": row.get("縣市", ""),
            "title": row.get("來源標題", ""),
        }
        for number, row in enumerate(rows, start=2)
        if row.get("審核狀態") == "pending" and is_google_news_url(row.get("來源網址", ""))
    ]


def read_inboxes():
    result = {}
    occurrences = defaultdict(list)
    for path in INBOXES:
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            rows = list(reader)
            result[path] = (reader.fieldnames or [], rows)
        for index, row in enumerate(rows):
            occurrences[row.get("source_url", "")].append((path, index))
    return result, occurrences


def normalized_title(value: str) -> str:
    return re.sub(r"[^0-9a-z\u3400-\u9fff]+", "", value.casefold())


def atomic_write(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=path.parent, delete=False) as target:
        writer = csv.DictWriter(target, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
        temporary = Path(target.name)
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply-inbox", action="store_true")
    parser.add_argument("--rollback-inbox", action="store_true")
    args = parser.parse_args()
    if args.rollback_inbox:
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        inboxes, _ = read_inboxes()
        restored = set()
        for item in report.get("results", []):
            if not item.get("new_url") or not item.get("inbox_file"):
                continue
            path = ROOT / "data/inbox" / str(item["inbox_file"])
            index = int(item["inbox_row"]) - 2
            if (path, index) in restored:
                continue
            inboxes[path][1][index]["source_url"] = str(item["url"])
            restored.add((path, index))
        for path, (fields, rows) in inboxes.items():
            atomic_write(path, fields, rows)
        print(f"restored_inbox_rows={len(restored)}")
        return
    targets = pending_sheet_urls()
    inboxes, occurrences = read_inboxes()
    by_title_city = defaultdict(list)
    for path, (_, rows) in inboxes.items():
        for index, row in enumerate(rows):
            by_title_city[(row.get("city", ""), normalized_title(row.get("source_title", "")))].append((path, index))
    cached = {}
    if REPORT.exists():
        previous = json.loads(REPORT.read_text(encoding="utf-8"))
        cached = {item["url"]: item for item in previous.get("results", []) if item.get("new_url")}
    results = []
    for position, item in enumerate(targets, start=1):
        old_url = str(item["url"])
        matches = occurrences.get(old_url, [])
        match_method = "url"
        if len(matches) != 1:
            matches = by_title_city.get((str(item["city"]), normalized_title(str(item["title"]))), [])
            match_method = "city_title"
        if len(matches) != 1:
            results.append({**item, "new_url": "", "method": "failed", "error": f"inbox 匹配 {len(matches)} 筆，必須為 1"})
        else:
            resolution = cached.get(old_url)
            if resolution:
                results.append({**item, "new_url": resolution["new_url"], "method": resolution["method"], "error": "", "match_method": match_method, "inbox_file": matches[0][0].name, "inbox_row": matches[0][1] + 2})
            else:
                decoded = resolve(old_url)
                results.append({**item, "new_url": decoded.url, "method": decoded.method, "error": decoded.error, "match_method": match_method, "inbox_file": matches[0][0].name, "inbox_row": matches[0][1] + 2})
        if position % 25 == 0:
            print(f"resolved {position}/{len(targets)}")
    successes = [item for item in results if item["new_url"]]
    if args.apply_inbox:
        updated_inbox_rows = set()
        for item in successes:
            path = ROOT / "data/inbox" / str(item["inbox_file"])
            index = int(item["inbox_row"]) - 2
            if (path, index) in updated_inbox_rows:
                continue
            inboxes[path][1][index]["source_url"] = str(item["new_url"])
            updated_inbox_rows.add((path, index))
        for path, (fields, rows) in inboxes.items():
            atomic_write(path, fields, rows)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({"target_count": len(targets), "success_count": len(successes), "failure_count": len(results) - len(successes), "applied_to_inbox": args.apply_inbox, "results": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"targets={len(targets)} success={len(successes)} failed={len(results)-len(successes)} apply_inbox={args.apply_inbox}")


if __name__ == "__main__":
    main()
