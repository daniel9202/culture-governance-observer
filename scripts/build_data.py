#!/usr/bin/env python3
import csv
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "input"
OUTPUT = ROOT / "data"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def rows(name):
    with (INPUT / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def required(row, fields, label):
    missing = [field for field in fields if not row.get(field, "").strip()]
    if missing:
        raise ValueError(f"{label}: missing {', '.join(missing)}")

def valid_date(value, label):
    if not DATE_RE.match(value):
        raise ValueError(f"{label}: date must be YYYY-MM-DD")

def valid_url(value, label):
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{label}: invalid URL")

def number(value, label):
    if value == "":
        return None
    try:
        result = int(value)
    except ValueError as exc:
        raise ValueError(f"{label}: amount must be an integer in TWD") from exc
    if result < 0:
        raise ValueError(f"{label}: amount cannot be negative")
    return result

def money(value):
    if value is None:
        return "尚待查核"
    if value >= 100_000_000:
        return f"{value / 100_000_000:.2f} 億元"
    if value >= 10_000:
        return f"{value / 10_000:.1f} 萬元"
    return f"{value:,} 元"

def ratio(part, total):
    if part is None or total in {None, 0}:
        return None
    return round(part / total * 100, 3)

def build_candidates():
    records = []
    for index, row in enumerate(rows("candidates.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"candidates.csv row {index}"
        required(row, ["id", "city", "office", "candidate", "party", "summary", "published_date", "source_title", "source_url", "last_verified"], label)
        valid_date(row["published_date"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["source_url"], label)
        records.append({
            "id": row["id"], "city": row["city"], "office": row["office"], "candidate": row["candidate"], "party": row["party"],
            "topics": [x.strip() for x in row["topics"].split("|") if x.strip()], "summary": row["summary"], "published_date": row["published_date"],
            "source_title": row["source_title"], "source_url": row["source_url"], "source_type": row["source_type"], "last_verified": row["last_verified"],
            "corrections": [x.strip() for x in row["correction_log"].split("||") if x.strip()]
        })
    return records

def build_civic_calls():
    records = []
    for index, row in enumerate(rows("civic_policy_calls.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"civic_policy_calls.csv row {index}"
        required(row, ["id", "city", "proposer", "proposer_type", "summary", "requested_action", "published_date", "source_title", "source_url", "last_verified"], label)
        valid_date(row["published_date"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["source_url"], label)
        records.append({
            "id": row["id"], "city": row["city"], "proposer": row["proposer"], "proposer_type": row["proposer_type"],
            "topics": [x.strip() for x in row["topics"].split("|") if x.strip()], "summary": row["summary"], "requested_action": row["requested_action"],
            "published_date": row["published_date"], "source_title": row["source_title"], "source_url": row["source_url"],
            "source_type": row["source_type"], "last_verified": row["last_verified"],
            "corrections": [x.strip() for x in row["correction_log"].split("||") if x.strip()]
        })
    return records

def build_governments():
    records = []
    for index, row in enumerate(rows("governments.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"governments.csv row {index}"
        required(row, ["id", "city", "year", "methodology", "official_source_title", "official_source_url", "last_verified"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["official_source_url"], label)
        amounts = {key: number(row[key].strip(), f"{label} {key}") for key in ["culture_budget", "actual_spending", "total_budget", "total_spending"]}
        budget_ratio = ratio(amounts["culture_budget"], amounts["total_budget"])
        spending_ratio = ratio(amounts["actual_spending"], amounts["total_spending"])
        records.append({
            "id": row["id"], "city": row["city"], "year": int(row["year"]), **amounts,
            "culture_budget_display": money(amounts["culture_budget"]), "actual_spending_display": money(amounts["actual_spending"]),
            "budget_ratio": budget_ratio, "budget_ratio_display": f"{budget_ratio:.2f}%" if budget_ratio is not None else "尚待查核",
            "spending_ratio": spending_ratio, "spending_ratio_display": f"{spending_ratio:.2f}%" if spending_ratio is not None else "尚待查核",
            "budget_scope": row["budget_scope"], "spending_scope": row["spending_scope"], "methodology": row["methodology"],
            "official_source_title": row["official_source_title"], "official_source_url": row["official_source_url"],
            "key_policies": [x.strip() for x in row["key_policies"].split("|") if x.strip()], "last_verified": row["last_verified"], "notes": row["notes"]
        })
    return records

def write(name, records):
    payload = {"schema_version": "1.1", "last_updated": date.today().isoformat(), "records": records}
    (OUTPUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    write("candidates.json", build_candidates())
    write("civic_policy_calls.json", build_civic_calls())
    write("governments.json", build_governments())
    print("data validation passed")
