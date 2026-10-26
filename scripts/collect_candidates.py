#!/usr/bin/env python3
import argparse
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
from html import unescape
from html.parser import HTMLParser
from datetime import datetime, timedelta, timezone
from pathlib import Path

from google_news_urls import resolve as resolve_google_news_url

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "collector.json"
SOURCE_REGISTRY = ROOT / "config" / "candidate_official_sources.csv"
FIELDS = ["collected_at", "city", "published_date", "source_name", "source_title", "source_url", "review_status", "review_note"]
COUNCILOR_FIELDS = FIELDS + ["resolution_error"]
CULTURE_RE = re.compile(r"文化|藝文|文資|古蹟|歷史建築|博物館|圖書館|文創|客家|原住民族文化|母語|本土語言|藝術季|文化地景|地方創生")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.links = []
        self._href = ""

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href", "")

    def handle_endtag(self, tag):
        if tag == "a":
            self._href = ""
        if tag in {"p", "li", "h1", "h2", "h3", "h4", "div", "br"}:
            self.parts.append("\n")

    def handle_data(self, data):
        value = unescape(data).strip()
        if not value:
            return
        self.parts.append(value)
        if self._href:
            self.links.append((value, self._href))

    @property
    def text(self):
        return re.sub(r"\n{2,}", "\n", " ".join(self.parts)).strip()


def fetch_page(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Culture Governance Observer/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read(1_500_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
    parser = PageParser()
    parser.feed(raw)
    return parser


def councilor_roster(collection):
    path = ROOT / collection["registered_candidates"]
    with path.open(encoding="utf-8-sig", newline="") as source:
        return [row for row in csv.DictReader(source) if row.get("office") == collection.get("office_filter", "縣市議員")]


def party_name(label):
    return label.removesuffix(" 議員候選人頁")


def normalized_party(value):
    return value


def candidate_sections(text, roster):
    positions = []
    for row in roster:
        match = re.search(re.escape(row["candidate"]), text)
        if match:
            positions.append((match.start(), row))
    positions.sort(key=lambda item: item[0])
    for index, (start, row) in enumerate(positions):
        end = positions[index + 1][0] if index + 1 < len(positions) else len(text)
        yield row, text[start:end]


def collect_councilor_pages(collection):
    inbox = ROOT / collection["inbox"]
    old_rows = load_rows(inbox)
    old_urls = {row.get("source_url", "") for row in old_rows}
    roster = councilor_roster(collection)
    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    rows = list(old_rows)
    stats = []
    for label, landing_url in collection["official_sites"].items():
        party = normalized_party(party_name(label))
        party_roster = [row for row in roster if row.get("party") == party]
        error = ""
        found = []
        policy_count = 0
        added = 0
        try:
            page = fetch_page(landing_url)
            found = list(candidate_sections(page.text, party_roster))
            detail_urls = []
            for _, href in page.links:
                absolute = urllib.parse.urljoin(landing_url, href)
                if ("candidatedetail" in absolute or "/candidate-" in absolute or
                        re.search(r"/candidates/[^/]+/?$", absolute)) and absolute not in detail_urls:
                    detail_urls.append(absolute)
            sources = [(landing_url, page.text)]
            for detail_url in detail_urls:
                try:
                    sources.append((detail_url, fetch_page(detail_url).text))
                except Exception as exc:
                    print(f"warning: {label}/{detail_url}: {exc}")
            seen_candidates = set()
            for source_url, source_text in sources:
                for candidate, section in candidate_sections(source_text, party_roster):
                    if candidate["candidate"] in seen_candidates or "政見" not in section:
                        continue
                    policy = section.split("政見", 1)[1]
                    policy = re.split(r"相關新聞|瀏覽所有新聞|支持\s|關於基進|©", policy, maxsplit=1)[0]
                    if not CULTURE_RE.search(policy):
                        continue
                    policy_count += 1
                    seen_candidates.add(candidate["candidate"])
                    unique_url = source_url
                    if source_url == landing_url:
                        unique_url += "#" + urllib.parse.quote(candidate["candidate"])
                    if unique_url in old_urls:
                        continue
                    rows.append({
                        "collected_at": collected_at,
                        "city": candidate["city"],
                        "published_date": "",
                        "source_name": label.replace(" 議員候選人頁", ""),
                        "source_title": f"{candidate['candidate']}｜2026 議員候選人政見",
                        "source_url": unique_url,
                        "review_status": "pending",
                        "review_note": f"名冊：{candidate['district']}；政黨：{candidate['party']}",
                        "resolution_error": "",
                    })
                    old_urls.add(unique_url)
                    added += 1
        except Exception as exc:
            error = f"fetch_error: {type(exc).__name__}: {exc}"
            print(f"warning: {label}: {error}")
        matched = len({row["candidate"] for row, _ in found})
        stats.append((label, landing_url, len(found), policy_count, matched, added, error))
    inbox.parent.mkdir(parents=True, exist_ok=True)
    with inbox.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=COUNCILOR_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    for label, url, found, policies, matched, added, error in stats:
        print(f"party={label} url={url} found={found} policy={policies} matched={matched} added={added} error={error}")
    print(f"{inbox.name}: {len(rows)} rows")

def load_rows(inbox):
    if not inbox.exists():
        return []
    with inbox.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def verified_campaign_sites():
    if not SOURCE_REGISTRY.exists():
        return {}
    with SOURCE_REGISTRY.open(encoding="utf-8-sig", newline="") as f:
        return {
            row["candidate"].strip(): row["campaign_website"].strip()
            for row in csv.DictReader(f)
            if row.get("website_status") == "verified" and row.get("campaign_website", "").strip()
        }

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
        news_url = item.findtext("link", "").strip()
        resolution = resolve_google_news_url(news_url)
        yield {
            "city": city,
            "published_date": iso_date(item.findtext("pubDate", "")),
            "source_name": (source.text or "").strip() if source is not None else "",
            "source_title": item.findtext("title", "").strip(),
            "source_url": resolution.url,
            "resolution_error": resolution.error,
        }

def collect(config, collection):
    if collection.get("source_mode") == "party_candidate_pages":
        collect_councilor_pages(collection)
        return
    inbox = ROOT / collection["inbox"]
    rows = load_rows(inbox)
    known_urls = {row.get("source_url", "") for row in rows}
    known_titles = [(row.get("city", ""), normalized_title(row.get("source_title", ""))) for row in rows]
    threshold = float(collection.get("duplicate_title_threshold", 0.92))
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=int(config["lookback_days"]))
    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    campaign_sites = verified_campaign_sites()
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
                official_site = campaign_sites.get(candidate, collection.get("official_sites", {}).get(candidate, ""))
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
                        if not item["source_url"]:
                            print(f"warning: Google News 網址解析失敗，略過：{item['resolution_error']}")
                            continue
                        if item["source_url"] in known_urls:
                            continue
                        if duplicate_title(city, item["source_title"], known_titles, threshold):
                            skipped_duplicates += 1
                            continue
                        if item["published_date"] and datetime.fromisoformat(item["published_date"]).date() < cutoff:
                            continue
                        # resolution_error 只用於上面的警告訊息，不是 inbox 欄位；
                        # 一起寫進 rows 會讓 csv.DictWriter 在寫檔時丟 ValueError。
                        item.pop("resolution_error", None)
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", choices=None, help="只執行指定 collection")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    collections = config["collections"]
    selected = {args.collection: collections[args.collection]} if args.collection else collections
    for collection in selected.values():
        collect(config, collection)

if __name__ == "__main__":
    main()
