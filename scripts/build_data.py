#!/usr/bin/env python3
import csv
import io
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data" / "input"
OUTPUT = ROOT / "data"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PROPOSER_ROLES = {"候選人", "推定現任議員", "待判定"}
CONTENT_NATURES = {"本屆競選政見", "現任議員個人頁內容", "現任問政／提案", "現任首長施政"}
REVIEW_STATUSES = {"人工審核", "AI初審待複核"}
TOPIC_CATEGORY_NAMES = {
    "文化治理與預算", "文化資產", "文化場館", "表演藝術", "視覺藝術", "博物館與地方文化館",
    "閱讀與圖書館", "影視與流行音樂", "文化產業與文創", "地方文化與社區營造", "民俗節慶",
    "藝文節慶", "原住民族文化", "客家文化", "語言與族群", "文化教育", "文化平權與參與",
    "高齡與世代共融", "永續與ESG", "數位文化與科技", "文化觀光", "文化空間與城市再生",
    "國際與兩岸交流", "青年"
}
TOPIC_CATEGORY_CONFIG = ROOT / "config" / "topic_categories.csv"
ISSUE_TAGS_CONFIG = ROOT / "config" / "issue_tags.json"
_TOPIC_CATEGORY_MAP = None
TOPIC_WARNINGS = []

def rows(name):
    with (INPUT / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def topic_category_map():
    global _TOPIC_CATEGORY_MAP
    if _TOPIC_CATEGORY_MAP is not None:
        return _TOPIC_CATEGORY_MAP
    issue_tags = json.loads(ISSUE_TAGS_CONFIG.read_text(encoding="utf-8"))
    if set(issue_tags) != TOPIC_CATEGORY_NAMES:
        missing = sorted(TOPIC_CATEGORY_NAMES - set(issue_tags))
        extra = sorted(set(issue_tags) - TOPIC_CATEGORY_NAMES)
        raise ValueError(f"config/issue_tags.json 必須正好包含 24 個大類；缺少={missing}，多出={extra}")
    mapping = {}
    with TOPIC_CATEGORY_CONFIG.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            tag = (row.get("tag") or "").strip()
            if not tag:
                continue
            categories = [x.strip() for x in (row.get("categories") or "").split("|") if x.strip()]
            invalid = sorted(set(categories) - TOPIC_CATEGORY_NAMES)
            if invalid:
                raise ValueError(f"config/topic_categories.csv 標籤「{tag}」含 24 類以外的大類：{'、'.join(invalid)}")
            if tag in mapping:
                raise ValueError(f"config/topic_categories.csv 細標籤重複：{tag}")
            subcategory = (row.get("subcategory") or "").strip()
            mapping[tag] = (categories, subcategory)
    _TOPIC_CATEGORY_MAP = mapping
    return mapping

def classify_topics(topics, label):
    mapping = topic_category_map()
    categories, subcategories = [], []
    for topic in topics:
        entry = mapping.get(topic)
        if entry is None:
            warning = f"{label}: topics 標籤「{topic}」不在 config/topic_categories.csv 對照表中"
            if warning not in TOPIC_WARNINGS:
                TOPIC_WARNINGS.append(warning)
            continue
        mapped_categories, subcategory = entry
        for category in mapped_categories:
            if category not in categories:
                categories.append(category)
            if subcategory:
                subcategory_label = f"{category}／{subcategory}"
                if subcategory_label not in subcategories:
                    subcategories.append(subcategory_label)
    return categories, subcategories

def baseline_candidate_ids():
    """Load committed candidate IDs so only newly added rows require publish_id immediately."""
    try:
        result = subprocess.run(
            ["git", "show", "HEAD:data/input/candidates.csv"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise ValueError("無法讀取 Git HEAD 的 candidates.csv，不能區分既有與新增資料") from exc
    return {
        (row.get("id") or "").strip()
        for row in csv.DictReader(io.StringIO(result.stdout))
        if (row.get("id") or "").strip()
    }

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

def valid_choice(value, allowed, field, label):
    if value not in allowed:
        raise ValueError(f"{label}: {field} must be one of {', '.join(sorted(allowed))}")

def field_sources(value, fallback_title, fallback_url, label):
    sources = []
    for item in (value or "").split("||"):
        item = item.strip()
        if not item:
            continue
        title, separator, url = item.partition("::")
        if not separator or not title.strip() or not url.strip():
            raise ValueError(f"{label}: sources must be 標題::網址")
        valid_url(url.strip(), label)
        sources.append({"title": title.strip(), "url": url.strip()})
    return sources or [{"title": fallback_title or "主要來源", "url": fallback_url}]

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
    baseline_ids = baseline_candidate_ids()
    missing_legacy_publish_ids = []
    seen_publish_ids = set()
    for index, row in enumerate(rows("candidates.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"candidates.csv row {index}"
        required(row, ["id", "city", "office", "candidate", "party", "summary", "published_date", "source_title", "source_url", "last_verified", "proposer_role", "content_nature", "role_evidence"], label)
        if "publish_id" not in row:
            raise ValueError("candidates.csv: missing publish_id column")
        publish_id = (row.get("publish_id") or "").strip()
        if publish_id:
            if publish_id in seen_publish_ids:
                raise ValueError(f"{label}: duplicate publish_id {publish_id}")
            seen_publish_ids.add(publish_id)
        elif row["id"] not in baseline_ids and not (row.get("correction_log", "") or "").startswith("2026-10-04｜由 civic_policy_calls.csv 既有資料遷入；"):
            raise ValueError(f"{label}: new record requires publish_id")
        else:
            missing_legacy_publish_ids.append(index)
        valid_date(row["published_date"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["source_url"], label)
        valid_choice(row["proposer_role"], PROPOSER_ROLES, "proposer_role", label)
        valid_choice(row["content_nature"], CONTENT_NATURES, "content_nature", label)
        if row["content_nature"] == "現任首長施政" and row["office"] != "縣市長":
            raise ValueError(f"{label}: 現任首長施政 is only valid when office is 縣市長")
        review_status = (row.get("review_status") or "").strip() or "人工審核"
        valid_choice(review_status, REVIEW_STATUSES, "review_status", label)
        related_sources = [x.strip() for x in (row.get("related_sources") or "").split("|") if x.strip()]
        for source in related_sources:
            valid_url(source, label)
        topics = [x.strip() for x in row["topics"].split("|") if x.strip()]
        topic_categories, topic_subcategories = classify_topics(topics, label)
        argument = (row.get("policy_argument") or "").strip() or f"以{'、'.join(topics)}為主要政策方向。"
        proposals = [x.strip() for x in (row.get("concrete_proposals") or "").split("||") if x.strip()]
        statements = [x.strip() for x in (row.get("related_statements") or "").split("||") if x.strip()]
        editor_notes = [x.strip() for x in (row.get("editor_notes") or "").split("||") if x.strip()]
        sources = {
            "policy_argument": field_sources(row.get("policy_argument_sources"), row["source_title"], row["source_url"], label),
            "concrete_proposals": field_sources(row.get("concrete_proposal_sources"), row["source_title"], row["source_url"], label),
            "related_statements": field_sources(row.get("related_statement_sources"), row["source_title"], row["source_url"], label),
        }
        records.append({
            "id": row["id"], "city": row["city"], "office": row["office"], "candidate": row["candidate"], "party": row["party"],
            "publish_id": publish_id,
            "review_status": review_status, "editor_notes": editor_notes,
            "policy_title": row.get("policy_title") or "",
            "topics": topics, "topic_categories": topic_categories, "topic_subcategories": topic_subcategories,
            "summary": row["summary"], "policy_argument": argument, "concrete_proposals": proposals, "related_statements": statements, "field_sources": sources, "published_date": row["published_date"],
            "source_title": row["source_title"], "source_url": row["source_url"], "related_sources": related_sources, "source_type": row["source_type"], "last_verified": row["last_verified"],
            "proposer_role": row["proposer_role"], "content_nature": row["content_nature"], "role_evidence": row["role_evidence"],
            "corrections": [x.strip() for x in row["correction_log"].split("||") if x.strip()]
        })
    if missing_legacy_publish_ids:
        examples = ", ".join(str(index) for index in missing_legacy_publish_ids[:8])
        suffix = "…" if len(missing_legacy_publish_ids) > 8 else ""
        print(
            f"WARNING candidates.csv: {len(missing_legacy_publish_ids)} 筆既有資料尚無 publish_id（資料列 {examples}{suffix}）",
            file=sys.stderr,
        )
    return records

def build_shared_policy_groups():
    records = []
    for index, row in enumerate(rows("shared_policy_groups.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"shared_policy_groups.csv row {index}"
        required(row, ["id", "city", "office", "party", "title", "summary", "published_date", "source_title", "source_url", "last_verified"], label)
        scope = (row.get("scope") or "regional").strip()
        if scope not in {"party", "regional"}:
            raise ValueError(f"{label}: scope must be party or regional")
        if scope == "regional" and not row.get("candidates", "").strip():
            raise ValueError(f"{label}: regional shared policies require candidates")
        valid_date(row["published_date"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["source_url"], label)
        topics = [x.strip() for x in row.get("topics", "").split("|") if x.strip()]
        topic_categories, topic_subcategories = classify_topics(topics, label)
        records.append({
            "id": row["id"], "scope": scope, "city": row["city"], "office": row["office"], "party": row["party"],
            "candidates": [x.strip() for x in row.get("candidates", "").split("||") if x.strip()],
            "title": row["title"], "topics": topics, "topic_categories": topic_categories, "topic_subcategories": topic_subcategories,
            "summary": row["summary"], "concrete_proposals": [x.strip() for x in row.get("concrete_proposals", "").split("||") if x.strip()],
            "published_date": row["published_date"], "source_title": row["source_title"], "source_url": row["source_url"],
            "source_type": row.get("source_type", "共同政見記者會"), "last_verified": row["last_verified"],
            "corrections": [x.strip() for x in row.get("correction_log", "").split("||") if x.strip()]
        })
    return records
def build_local_issues():
    records = []
    for index, row in enumerate(rows("local_cultural_issues.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"local_cultural_issues.csv row {index}"
        required(row, ["id", "city", "title", "issue_type", "summary", "published_date", "source_title", "source_url", "last_verified"], label)
        valid_date(row["published_date"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["source_url"], label)
        topics = [x.strip() for x in row["topics"].split("|") if x.strip()]
        topic_categories, topic_subcategories = classify_topics(topics, label)
        records.append({
            "id": row["id"], "city": row["city"], "title": row["title"], "issue_type": row["issue_type"],
            "topics": topics, "topic_categories": topic_categories, "topic_subcategories": topic_subcategories, "summary": row["summary"],
            "related_actor": row["related_actor"], "published_date": row["published_date"], "source_title": row["source_title"],
            "source_url": row["source_url"], "source_type": row["source_type"], "last_verified": row["last_verified"],
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
        review_status = (row.get("review_status") or "").strip() or "人工審核"
        valid_choice(review_status, REVIEW_STATUSES, "review_status", label)
        topics = [x.strip() for x in row["topics"].split("|") if x.strip()]
        topic_categories, topic_subcategories = classify_topics(topics, label)
        records.append({
            "id": row["id"], "city": row["city"], "proposer": row["proposer"], "proposer_type": row["proposer_type"],
            "review_status": review_status,
            "topics": topics, "topic_categories": topic_categories, "topic_subcategories": topic_subcategories,
            "summary": row["summary"], "requested_action": row["requested_action"],
            "published_date": row["published_date"], "source_title": row["source_title"], "source_url": row["source_url"],
            "source_type": row["source_type"], "last_verified": row["last_verified"],
            "corrections": [x.strip() for x in row["correction_log"].split("||") if x.strip()]
        })
    return records

def build_fulfillment():
    records = []
    allowed_statuses = {"fulfilled", "partial", "in_progress", "no_verified_progress", "not_assessable"}
    for index, row in enumerate(rows("pledge_fulfillment.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"pledge_fulfillment.csv row {index}"
        required(row, ["id", "city", "person", "party", "current_office", "term", "election", "reelection_status", "pledge_source_type", "pledge_title", "pledge_summary", "pledge_date", "pledge_source_title", "pledge_source_url", "responsibility", "status", "evidence_summary", "last_verified"], label)
        valid_date(row["pledge_date"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["pledge_source_url"], label)
        if row["status"] not in allowed_statuses:
            raise ValueError(f"{label}: invalid status")
        evidence_url = row.get("evidence_source_url", "").strip()
        if evidence_url:
            valid_url(evidence_url, label)
        # 補充證據每筆為「標題::網址」，多筆以 || 分隔。
        additional_evidence = []
        for item in row.get("additional_evidence", "").split("||"):
            item = item.strip()
            if not item:
                continue
            title, separator, url = item.partition("::")
            if not separator or not title.strip() or not url.strip():
                raise ValueError(f"{label}: additional_evidence must be 標題::網址")
            valid_url(url.strip(), label)
            additional_evidence.append({"title": title.strip(), "url": url.strip()})
        topics = [x.strip() for x in row["topics"].split("|") if x.strip()]
        topic_categories, topic_subcategories = classify_topics(topics, label)
        records.append({
            "id": row["id"], "city": row["city"], "person": row["person"], "party": row["party"],
            "current_office": row["current_office"], "term": row["term"], "election": row["election"],
            "reelection_status": row["reelection_status"],
            "topics": topics, "topic_categories": topic_categories, "topic_subcategories": topic_subcategories,
            "pledge_title": row["pledge_title"], "pledge_summary": row["pledge_summary"], "pledge_date": row["pledge_date"],
            "pledge_source_type": row["pledge_source_type"], "pledge_source_title": row["pledge_source_title"], "pledge_source_url": row["pledge_source_url"],
            "responsibility": row["responsibility"], "status": row["status"], "evidence_summary": row["evidence_summary"],
            "evidence_source_title": row.get("evidence_source_title", ""), "evidence_source_url": evidence_url,
            "additional_evidence": additional_evidence,
            "last_verified": row["last_verified"], "corrections": [x.strip() for x in row["correction_log"].split("||") if x.strip()]
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
        amount_fields = ["cultural_expenditure_budget", "cultural_expenditure_final", "bureau_budget", "bureau_final", "total_budget"]
        amounts = {key: number(row[key].strip(), f"{label} {key}") for key in amount_fields}
        cultural_execution_ratio = ratio(amounts["cultural_expenditure_final"], amounts["cultural_expenditure_budget"])
        bureau_execution_ratio = ratio(amounts["bureau_final"], amounts["bureau_budget"])
        cultural_budget_ratio = ratio(amounts["cultural_expenditure_budget"], amounts["total_budget"])
        bureau_budget_ratio = ratio(amounts["bureau_budget"], amounts["total_budget"])
        bureau_share_of_cultural_budget = ratio(amounts["bureau_budget"], amounts["cultural_expenditure_budget"])
        records.append({
            "id": row["id"], "city": row["city"], "year": int(row["year"]), **amounts,
            **{f"{key}_display": money(value) for key, value in amounts.items()},
            "cultural_execution_ratio": cultural_execution_ratio,
            "bureau_execution_ratio": bureau_execution_ratio,
            "cultural_budget_ratio": cultural_budget_ratio,
            "bureau_budget_ratio": bureau_budget_ratio,
            "bureau_share_of_cultural_budget": bureau_share_of_cultural_budget,
            "cultural_execution_ratio_display": f"{cultural_execution_ratio:.2f}%" if cultural_execution_ratio is not None else "尚待查核",
            "bureau_execution_ratio_display": f"{bureau_execution_ratio:.2f}%" if bureau_execution_ratio is not None else "尚待查核",
            "cultural_budget_ratio_display": f"{cultural_budget_ratio:.2f}%" if cultural_budget_ratio is not None else "尚待查核",
            "bureau_budget_ratio_display": f"{bureau_budget_ratio:.2f}%" if bureau_budget_ratio is not None else "尚待查核",
            "bureau_share_of_cultural_budget_display": f"{bureau_share_of_cultural_budget:.2f}%" if bureau_share_of_cultural_budget is not None else "尚待查核",
            "bureau_scope_note": row["bureau_scope_note"], "methodology": row["methodology"],
            "official_source_title": row["official_source_title"], "official_source_url": row["official_source_url"],
            "key_policies": [x.strip() for x in row["key_policies"].split("|") if x.strip()], "last_verified": row["last_verified"], "notes": row["notes"]
        })
    return records

def build_region_metrics():
    # Tuple, not a set: iteration order decides the JSON key order, so it must be stable across builds.
    numeric_fields = (
        "monuments", "historical_buildings", "memorial_buildings", "settlements", "historical_sites",
        "cultural_landscapes", "archaeological_sites", "antiquities", "traditional_arts", "folklore",
        "oral_traditions", "traditional_knowledge", "cultural_venues_total", "dedicated_arts_venues",
        "museum_art_venues", "memorial_cultural_halls", "galleries", "auditoriums", "theatre_rehearsal_venues",
        "library_data_venues", "statutory_museums", "local_cultural_halls", "arts_events_total",
        "arts_attendance_thousands", "visual_arts_events", "craft_events", "design_events",
        "classical_traditional_music_events", "popular_music_events", "drama_events", "dance_events",
        "folklore_heritage_events", "language_library_events", "festivals", "international_festivals",
        "festival_days", "festival_attendance", "arts_groups", "arts_foundations", "street_performance_venues",
        "street_artists_or_groups", "central_grants_thousand", "local_matching_thousand",
        "community_grants_thousand", "community_matching_thousand", "museum_hall_grants_thousand",
        "museum_hall_matching_thousand",
    )
    records = []
    for index, row in enumerate(rows("region_metrics.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"region_metrics.csv row {index}"
        required(row, ["id", "city", "year", "source_title", "source_url", "last_verified"], label)
        valid_date(row["last_verified"], label)
        valid_url(row["source_url"], label)
        record = {"id": row["id"], "city": row["city"], "year": int(row["year"])}
        for field in numeric_fields:
            value = row.get(field, "").strip()
            if not value:
                record[field] = None
            else:
                parsed = float(value)
                record[field] = int(parsed) if parsed.is_integer() else parsed
        record.update({
            "source_title": row["source_title"], "source_url": row["source_url"],
            "source_files": [x.strip() for x in row.get("source_files", "").split("|") if x.strip()],
            "last_verified": row["last_verified"], "notes": row.get("notes", "")
        })
        records.append(record)
    return records

REGISTERED_OFFICES = {"縣市長", "縣市議員"}
CITIES = {
    "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹市", "嘉義市", "新竹縣", "苗栗縣",
    "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
}

def build_registered_candidates():
    """中選會登記名冊（scripts/import_cec_registrations.py 產生），用於計算各縣市參選人數。"""
    records, sources = [], []
    for index, row in enumerate(rows("registered_candidates.csv"), start=2):
        if not any(row.values()):
            continue
        label = f"registered_candidates.csv row {index}"
        required(row, ["city", "office", "district", "candidate", "party", "registered_date", "source_title", "source_url", "as_of"], label)
        if row["city"] not in CITIES:
            raise ValueError(f"{label}: unknown city {row['city']}")
        if row["office"] not in REGISTERED_OFFICES:
            raise ValueError(f"{label}: office must be one of {', '.join(sorted(REGISTERED_OFFICES))}")
        valid_date(row["registered_date"], label)
        valid_date(row["as_of"], label)
        valid_url(row["source_url"], label)
        source = {"title": row["source_title"], "url": row["source_url"], "as_of": row["as_of"]}
        if sources and source not in sources:
            raise ValueError(f"{label}: all rows must share one source and as_of date")
        sources = sources or [source]
        records.append({
            "city": row["city"], "office": row["office"], "district": row["district"], "candidate": row["candidate"],
            "party": row["party"], "registered_date": row["registered_date"],
        })
    # 來源與名冊日期全表一致，只在檔案層級記錄一次，避免前台資料過大
    return records, (sources[0] if sources else None)

def same_candidate(registered_name, name):
    """中選會名冊可能在姓名後附原住民族傳統名字（例：林筱薇IcyangTamana），與 map.js 的比對規則一致。"""
    return registered_name == name or registered_name.startswith(name)

def normal_party(party):
    return "無黨籍" if party.strip() in {"", "無", "無黨籍"} else party.strip()

def check_against_registration(candidates, shared_groups, registered):
    """候選人資料與中選會登記名冊交叉檢查。

    錯誤（停止建置）：縣市或職務寫法不在清單內、政黨與中選會「推薦之政黨」不符。
    警告（照常建置）：名冊中找不到該候選人，或比對到多人。
    """
    errors, warnings = [], []
    roster = {}
    for record in registered:
        roster.setdefault((record["city"], record["office"]), []).append(record)
    people = [(f"candidates.csv {c['id']}", c["city"], c["office"], c["candidate"], c["party"]) for c in candidates]
    for group in shared_groups:
        if group["scope"] == "party":
            continue
        people += [(f"shared_policy_groups.csv {group['id']}", group["city"], group["office"], name, group["party"]) for name in group["candidates"]]
    checked = set()
    for label, city, office, name, party in people:
        if city not in CITIES:
            errors.append(f"{label}: 縣市「{city}」不是 22 縣市的標準寫法（例：臺北市，不是台北市）")
            continue
        if office not in REGISTERED_OFFICES:
            errors.append(f"{label}: 職務「{office}」必須是 縣市長 或 縣市議員")
            continue
        if (city, office, name, party) in checked:
            continue
        checked.add((city, office, name, party))
        matches = [r for r in roster.get((city, office), []) if same_candidate(r["candidate"], name)]
        if not matches:
            warnings.append(f"{label}: {city}{office}「{name}」不在中選會登記名冊中，請確認姓名寫法或是否已登記參選")
        elif len(matches) > 1:
            warnings.append(f"{label}: {city}{office}「{name}」在名冊中比對到 {len(matches)} 人（{'、'.join(m['candidate'] for m in matches)}），請改用完整姓名")
        elif normal_party(matches[0]["party"]) != normal_party(party):
            errors.append(f"{label}: {city}{office}「{name}」政黨填「{party}」，中選會推薦之政黨為「{matches[0]['party']}」；政黨以中選會為準（未推薦請填 無黨籍）")
    return errors, warnings

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

def build_party_colors(candidates, shared_groups):
    """讀 config/party_colors.json，檢查色碼，並對沒有政黨色的政黨發出警告。"""
    config = json.loads((ROOT / "config" / "party_colors.json").read_text(encoding="utf-8"))
    parties, other = config["parties"], config["_other"]
    for name, item in [*parties.items(), ("_other", other)]:
        for field in ("color", "outline"):
            if field in item and not HEX_RE.match(item[field]):
                raise ValueError(f"config/party_colors.json {name}: {field} must be #RRGGBB")
        if not item.get("short"):
            raise ValueError(f"config/party_colors.json {name}: missing short")
    used = {c["party"] for c in candidates} | {g["party"] for g in shared_groups if g["scope"] == "regional"}
    warnings = [f"政黨「{party}」沒有設定政黨色，地圖會顯示為「{other['short']}」；請確認公認色後補進 config/party_colors.json"
                for party in sorted(used - parties.keys())]
    return {"parties": parties, "other": other}, warnings

def report_warnings(warnings):
    for message in warnings:
        # 在 GitHub Actions 中以 annotation 顯示，本機則印出到標準錯誤
        print(f"::warning title=資料檢查::{message}" if os.environ.get("GITHUB_ACTIONS") else f"WARNING {message}", file=sys.stderr)

def write(name, records, **meta):
    payload = {"schema_version": "1.1", "last_updated": date.today().isoformat(), **meta, "records": records}
    (OUTPUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    candidates = build_candidates()
    shared_groups = build_shared_policy_groups()
    local_issues = build_local_issues()
    civic_calls = build_civic_calls()
    fulfillment = build_fulfillment()
    registered, registered_source = build_registered_candidates()
    errors, warnings = check_against_registration(candidates, shared_groups, registered)
    party_colors, party_warnings = build_party_colors(candidates, shared_groups)
    report_warnings(warnings + party_warnings + TOPIC_WARNINGS)
    if errors:
        raise SystemExit("候選人資料與中選會登記名冊不符：\n" + "\n".join(f"- {message}" for message in errors))
    write("candidates.json", candidates)
    write("shared_policy_groups.json", shared_groups)
    write("local_cultural_issues.json", local_issues)
    write("civic_policy_calls.json", civic_calls)
    write("governments.json", build_governments())
    write("region_metrics.json", build_region_metrics())
    write("pledge_fulfillment.json", fulfillment)
    write("registered_candidates.json", registered, source=registered_source)
    (OUTPUT / "party_colors.json").write_text(json.dumps({"schema_version": "1.1", "last_updated": date.today().isoformat(), **party_colors}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("data validation passed")
