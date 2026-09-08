"""Extract an official councilor-registration PDF into the research roster.

This roster is an identification source for policy research.  It is not a
public policy record and does not publish candidates to the dashboard.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import pdfplumber


FIELDS = [
    "city",
    "electoral_district",
    "candidate",
    "party",
    "registration_date_roc",
    "incumbent",
    "roster_status",
    "source_title",
    "source_url",
    "source_date",
]


def normalise_party(value: str) -> str:
    return "無黨籍" if value.strip() in {"", "無"} else value.strip()


def parse(pdf_path: Path, city: str, source_title: str, source_url: str, source_date: str):
    records = []
    with pdfplumber.open(pdf_path) as document:
        for page in document.pages:
            for table in page.extract_tables():
                if not table or "姓名" not in table[0]:
                    continue
                header = [str(value or "").strip() for value in table[0]]
                columns = {name: index for index, name in enumerate(header)}
                for row in table[1:]:
                    row = [str(value or "").strip().replace("\n", " ") for value in row]
                    name = row[columns["姓名"]] if len(row) > columns["姓名"] else ""
                    district = row[columns["選舉區"]] if len(row) > columns["選舉區"] else ""
                    if not name or not district:
                        continue
                    party_index = columns.get("推薦之政黨")
                    date_index = columns.get("登記日期")
                    incumbent_index = columns.get("是否現任")
                    records.append({
                        "city": city,
                        "electoral_district": district,
                        "candidate": name,
                        "party": normalise_party(row[party_index] if party_index is not None and len(row) > party_index else ""),
                        "registration_date_roc": row[date_index] if date_index is not None and len(row) > date_index else "",
                        "incumbent": row[incumbent_index] if incumbent_index is not None and len(row) > incumbent_index else "",
                        "roster_status": "已完成登記，待中選會審定",
                        "source_title": source_title,
                        "source_url": source_url,
                        "source_date": source_date,
                    })
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--city", required=True)
    parser.add_argument("--source-title", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-date", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    records = parse(args.pdf, args.city, args.source_title, args.source_url, args.source_date)
    if not records:
        raise SystemExit("未從 PDF 擷取到候選人名冊")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(records)
    print(f"已寫入 {len(records)} 筆：{args.output}")


if __name__ == "__main__":
    main()
