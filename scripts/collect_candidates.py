#!/usr/bin/env python3
import csv
import email.utils
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "collector.json"
FIELDS = ["collected_at", "city", "published_date", "source_name", "source_title", "source_url", "review_status", "review_note"]

def load_rows(inbox):
    if not inbox.exists():
        return []
    with inbox.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def iso_date(value):
    try:
        return email.utils.parsedate_to_datetime(value).date().isoformat()
    except Exception:
        return ""

def fetch(city, terms, limit):
    query = f'"{city}" {terms}'
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": query, "hl": "zh-TW", "gl": "TW", "ceid": "TW:zh-Hant"})
    request = urllib.request.Request(url, headers={"User-Agent": "culture-governance-observer/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        root = ET.fromstring(response.read())
    for item in root.findall("./channel/item")[:limit]:
        source = item.find("source")
        yield {
            "city": city,
            "published_date": iso_date(item.findtext("pubDate", "")),
            "source_name": (source.text or "").strip() if source is not None else "",
            "source_title": item.findtext("title", "").strip(),
            "source_url": item.findtext("link", "").strip(),
        }

def collect(config, collection):
    inbox = ROOT / collection["inbox"]
    rows = load_rows(inbox)
    known = {row.get("source_url", "") for row in rows}
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=int(config["lookback_days"]))
    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    for city in config["cities"]:
        try:
            for item in fetch(city, collection["query_terms"], int(collection["max_items_per_city"])):
                if not item["source_url"] or item["source_url"] in known:
                    continue
                if item["published_date"] and datetime.fromisoformat(item["published_date"]).date() < cutoff:
                    continue
                rows.append({"collected_at": collected_at, **item, "review_status": "pending", "review_note": ""})
                known.add(item["source_url"])
        except Exception as exc:
            print(f"warning: {city}: {exc}")
        time.sleep(0.25)
    inbox.parent.mkdir(parents=True, exist_ok=True)
    with inbox.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{inbox.name}: {len(rows)} rows")

def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    for collection in config["collections"].values():
        collect(config, collection)

if __name__ == "__main__":
    main()
