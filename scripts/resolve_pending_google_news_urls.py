#!/usr/bin/env python3
"""Resolve pending Google News review URLs in Sheet and matching inbox rows."""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import gspread

from google_news_urls import is_google_news_url, resolve
from google_review_pipeline import sheets_batch_update_with_retry

ROOT = Path(__file__).resolve().parents[1]
INBOXES = (ROOT / "data/inbox/candidate_sources.csv", ROOT / "data/inbox/civic_policy_calls.csv")
REPORT = ROOT / "data/research/google_news_url_resolution.json"
RESOLVE_WORKERS = 6
SHEET_BATCH_SIZE = 50


def spreadsheet_id() -> str:
    source = (ROOT / "apps-script/Code.gs").read_text(encoding="utf-8")
    match = re.search(r"^const SPREADSHEET_ID = '([^']+)'", source, re.M)
    if not match:
        raise RuntimeError("Code.gs 找不到 SPREADSHEET_ID")
    return match.group(1)


def worksheet():
    credentials = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    return gspread.service_account_from_dict(credentials).open_by_key(spreadsheet_id()).worksheet("審核資料")


def pending_sheet_rows(ws) -> list[dict[str, str | int | bool]]:
    values = ws.get_all_values()
    if not values:
        return []
    columns = {name: index for index, name in enumerate(values[0])}
    required = {"來源網址", "縣市", "來源標題", "審核狀態", "AI摘要", "AI處理狀態"}
    missing = sorted(required - columns.keys())
    if missing:
        raise RuntimeError(f"Google Sheet 缺少欄位：{', '.join(missing)}")
    rows = []
    for number, row in enumerate(values[1:], start=2):
        row += [""] * (len(values[0]) - len(row))
        url = row[columns["來源網址"]]
        if row[columns["審核狀態"]] != "pending" or not is_google_news_url(url):
            continue
        rows.append({
            "row_number": number,
            "url": url,
            "city": row[columns["縣市"]],
            "title": row[columns["來源標題"]],
            "was_complete_with_summary": row[columns["AI處理狀態"]] == "complete" and bool(row[columns["AI摘要"]].strip()),
        })
    return rows


def read_inbox_occurrences():
    occurrences = defaultdict(list)
    for path in INBOXES:
        with path.open(encoding="utf-8-sig", newline="") as source:
            for number, row in enumerate(csv.DictReader(source), start=2):
                occurrences[row.get("source_url", "")].append((path, number))
    return occurrences


def replace_inbox_urls(replacements: dict[str, str]) -> int:
    changed = 0
    for path in INBOXES:
        data = path.read_bytes()
        original = data
        for old_url, new_url in replacements.items():
            old = old_url.encode("utf-8")
            count = data.count(old)
            if count:
                data = data.replace(old, new_url.encode("utf-8"))
                changed += count
        if data != original:
            with tempfile.NamedTemporaryFile("wb", dir=path.parent, delete=False) as target:
                target.write(data)
                temporary = Path(target.name)
            temporary.replace(path)
    return changed


def resolve_targets(targets: list[dict], cached: dict[str, dict]) -> list[dict]:
    resolutions = {}
    unresolved = sorted({str(item["url"]) for item in targets if str(item["url"]) not in cached})
    with ThreadPoolExecutor(max_workers=RESOLVE_WORKERS) as executor:
        futures = {executor.submit(resolve, url): url for url in unresolved}
        for completed, future in enumerate(as_completed(futures), start=1):
            url = futures[future]
            resolutions[url] = future.result()
            if completed % 25 == 0 or completed == len(futures):
                print(f"resolved {completed}/{len(futures)}")
    results = []
    for item in targets:
        old_url = str(item["url"])
        previous = cached.get(old_url)
        if previous:
            new_url = str(previous["new_url"])
            method = str(previous.get("method", "cached"))
            error = ""
        else:
            resolution = resolutions[old_url]
            new_url, method, error = resolution.url, resolution.method, resolution.error
        results.append({**item, "new_url": new_url, "method": method, "error": error})
    return results


def apply_sheet_results(ws, results: list[dict], device: str) -> None:
    updates = []
    for item in results:
        number = int(item["row_number"])
        if item["new_url"]:
            updates.extend([
                {"range": f"G{number}", "values": [[item["new_url"]]]},
                {"range": f"I{number}:Q{number}", "values": [[""] * 9]},
                {"range": f"U{number}:V{number}", "values": [["queued", device]]},
                {"range": f"X{number}:Y{number}", "values": [["", ""]]},
            ])
        else:
            completed_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
            error = f"Google News 網址解析失敗：{item['error']}"
            updates.extend([
                {"range": f"I{number}:Q{number}", "values": [[""] * 9]},
                {"range": f"U{number}:V{number}", "values": [["error", device]]},
                {"range": f"X{number}:Y{number}", "values": [[completed_at, error]]},
            ])
        if len(updates) >= SHEET_BATCH_SIZE * 4:
            sheets_batch_update_with_retry(ws, updates)
            updates = []
    if updates:
        sheets_batch_update_with_retry(ws, updates)


def update_report(results: list[dict], applied: bool) -> None:
    previous = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {"results": []}
    replacements = {(int(item["row_number"]), str(item["url"])): item for item in results}
    merged = []
    seen = set()
    for item in previous.get("results", []):
        key = (int(item.get("row_number", 0)), str(item.get("url", "")))
        merged.append(replacements.get(key, item))
        seen.add(key)
    for key, item in replacements.items():
        if key not in seen:
            merged.append(item)
    successes = sum(1 for item in merged if item.get("new_url"))
    payload = {
        "target_count": len(merged),
        "success_count": successes,
        "failure_count": len(merged) - successes,
        "applied_to_sheet": applied,
        "results": merged,
    }
    REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="更新 Sheet，並同步所有完全相符的 inbox 網址")
    args = parser.parse_args()
    ws = worksheet()
    targets = pending_sheet_rows(ws)
    occurrences = read_inbox_occurrences()
    previous = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {"results": []}
    cached = {str(item["url"]): item for item in previous.get("results", []) if item.get("new_url")}
    results = resolve_targets(targets, cached)
    successes = [item for item in results if item["new_url"]]
    failures = [item for item in results if not item["new_url"]]
    audited = sum(1 for item in targets if item["was_complete_with_summary"])
    matched_urls = {str(item["url"]): str(item["new_url"]) for item in successes if occurrences.get(str(item["url"]))}
    inbox_matches = sum(len(occurrences[url]) for url in matched_urls)
    if args.apply:
        device = f"{os.environ.get('COMPUTERNAME') or os.environ.get('HOSTNAME') or 'UNKNOWN'}-Codex"
        apply_sheet_results(ws, results, device)
        changed_inbox = replace_inbox_urls(matched_urls)
        if changed_inbox != inbox_matches:
            raise RuntimeError(f"inbox 更新筆數不符：預期 {inbox_matches}，實際 {changed_inbox}")
    update_report(results, args.apply)
    print(
        f"targets={len(targets)} success={len(successes)} failed={len(failures)} "
        f"cleared_complete={audited} inbox_matches={inbox_matches} apply={args.apply}"
    )


if __name__ == "__main__":
    main()
