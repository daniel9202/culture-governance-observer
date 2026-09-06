#!/usr/bin/env python3
import csv
import difflib
import email.utils
import json
import re
import time
import unicodedata
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

def normalized_title(value):
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.split(r"\s+[-｜|]\s+", value, maxsplit=1)[0]
    return re.sub(r"[\W_]+", "", value)

def duplicate_title(city, title, known_titles, threshold):
    target = normalized_title(title)
    if not target:
        return False
    for known_city, known_title in known_titles:
        if city != known_city or not known_title:
            continue
        if target == known_title:
            return True
        if difflib.SequenceMatcher(None, target, known_title).ratio() >= threshold:
            return True
    return False

def fetch(city, terms, limit, candidate="", site=""):
    if site:
        subject = f'site:{urllib.parse.urlparse(site).netloc}'
    else:
        subject = f'"{candidate}"' if candidate else f'"{city}"'
    query = f'{subject} {terms}'
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
    known_urls = {row.get("source_url", "") for row in rows}
    known_titles = [(row.get("city", ""), normalized_title(row.get("source_title", ""))) for row in rows]
    threshold = float(collection.get("duplicate_title_threshold", 0.92))
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=int(config["lookback_days"]))
    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    skipped_duplicates = 0
    for city in config["cities"]:
        candidates = collection.get("candidates_by_city", {}).get(city, [""])
        added_for_city = 0
        for candidate in candidates:
            if added_for_city >= int(collection["max_items_per_city"]):
                break
            try:
                remaining = int(collection["max_items_per_city"]) - added_for_city
                candidate_limit = min(remaining, int(collection.get("max_items_per_candidate", remaining)))
                official_site = collection.get("official_sites", {}).get(candidate, "")
                queries = [(candidate, "")]
                if official_site:
                    queries.append((candidate, official_site))
                added_for_candidate = 0
                for query_candidate, query_site in queries:
                    if added_for_candidate >= candidate_limit:
                        break
                    query_limit = min(
                        candidate_limit - added_for_candidate,
                        int(collection.get("max_items_per_query", candidate_limit)),
                    )
                    for item in fetch(city, collection["query_terms"], query_limit, query_candidate, query_site):
                        if not item["source_url"] or item["source_url"] in known_urls:
                            continue
                        if duplicate_title(city, item["source_title"], known_titles, threshold):
                            skipped_duplicates += 1
                            continue
                        if item["published_date"] and datetime.fromisoformat(item["published_date"]).date() < cutoff:
                            continue
                        rows.append({"collected_at": collected_at, **item, "review_status": "pending", "review_note": ""})
                        known_urls.add(item["source_url"])
                        known_titles.append((city, normalized_title(item["source_title"])))
                        added_for_city += 1
                        added_for_candidate += 1
            except Exception as exc:
                label = f"{city}/{candidate}" if candidate else city
                print(f"warning: {label}: {exc}")
            time.sleep(0.25)
    inbox.parent.mkdir(parents=True, exist_ok=True)
    with inbox.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{inbox.name}: {len(rows)} rows; skipped {skipped_duplicates} duplicate titles")

def main():
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    for collection in config["collections"].values():
        collect(config, collection)

if __name__ == "__main__":
    main()
