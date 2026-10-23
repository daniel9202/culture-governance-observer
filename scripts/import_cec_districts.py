"""把中選會選舉區劃分公告 PDF 轉成 config/election_districts.csv。

來源：中央選舉委員會 115 年 8 月 20 日中選務字第1153150253號公告
「公告115年直轄市長、縣（市）長、直轄市議員、縣（市）議員選舉之選舉種類、
名額、選舉區之劃分、投票日期、投票起止時間及競選經費最高金額等事項」
https://web.cec.gov.tw/central/article/63625

只取「（三）直轄市議員」「（四）縣（市）議員」兩張表；縣市長部分每縣市一區，
不需要對照表。PDF 不納入版本庫。執行（需 pdfplumber）：

    py -3 scripts/import_cec_districts.py <公告 PDF> --as-of 2026-08-20

選舉區名稱與 data/input/registered_candidates.csv 的 district 欄位對齊
（「臺北市第1選舉區」），轉檔後會比對兩邊是否一字不差。
"""
from pathlib import Path
import argparse
import csv
import re

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "config" / "election_districts.csv"
ROSTER = ROOT / "data" / "input" / "registered_candidates.csv"
SOURCE_TITLE = "中央選舉委員會：115年直轄市長、縣（市）長、直轄市議員、縣（市）議員選舉之選舉種類、名額、選舉區之劃分、投票日期、投票起止時間及競選經費最高金額等事項公告（中選務字第1153150253號）"
SOURCE_URL = "https://web.cec.gov.tw/central/article/63625"
EXPECTED_DISTRICTS = 221  # 中選會公告的議員選舉區總數；與名冊比對後確認

DISTRICT_RE = re.compile(r"^第(\d+)選舉區$")
# 原住民選舉區的範圍寫法：「臺北市之平地原住民」「尖石鄉及竹北市、……之山地原住民」
PLAIN_INDIGENOUS = "平地原住民"
MOUNTAIN_INDIGENOUS = "山地原住民"


def clean(cell):
    """表格欄位去掉換行與空白；直書的縣市名會被拆成一字一行。"""
    return re.sub(r"\s+", "", cell or "")


def district_type(scope):
    if scope.endswith(MOUNTAIN_INDIGENOUS):
        return MOUNTAIN_INDIGENOUS
    if scope.endswith(PLAIN_INDIGENOUS):
        return PLAIN_INDIGENOUS
    return "區域"


def split_units(scope):
    """區域選舉區的範圍拆成鄉鎮市區或村里清單；原住民選舉區不拆。"""
    units = [unit for unit in scope.split("、") if unit]
    # 新竹縣第1、2選舉區寫成「竹北市尚義里、崇義里、……」：第一項帶鄉鎮市名，其餘只有里名
    if units and units[0].endswith("里") and len(units[0]) > 3:
        prefix = units[0][: units[0].index("里") - 2]
        if prefix.endswith(("市", "鎮", "鄉", "區")):
            units[0] = units[0][len(prefix):]
            return prefix, units
    return "", units


def unit_level(units):
    return "村里" if all(unit.endswith("里") for unit in units) else "鄉鎮市區"


def read_rows(pdf_path):
    """掃過公告的議員選舉區表，回傳 (縣市, 第N選舉區, 範圍, 名額)。"""
    cities = {row["city"] for row in csv.DictReader(ROSTER.open(encoding="utf-8"))}
    # 縣市名是直書的合併儲存格，會被拆成一列一字（「桃」「園」「市」），而且可能跨頁，
    # 所以先以「第1選舉區」切出每個縣市的區塊，再把區塊內的字接起來比對縣市名。
    blocks, block = [], ["", []]
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for cell in table:
                    if len(cell) < 5:
                        continue
                    label, district, scope, seats = (clean(cell[0]), clean(cell[1]), clean(cell[2]), clean(cell[3]))
                    if DISTRICT_RE.match(district):
                        if district == "第1選舉區" and block[1]:
                            blocks.append(block)
                            block = ["", []]
                        block[1].append([district, scope, seats])
                    elif block[1] and not district and scope:
                        # 範圍太長被拆到下一列（或下一頁）時，選舉區欄是空的，接回上一筆
                        block[1][-1][1] += scope
                    block[0] += label
    blocks.append(block)

    rows = []
    for fragments, districts in blocks:
        if not districts:
            continue
        # 區塊開頭是該縣市的名字，後面可能跟著續頁的表頭（「縣（市）別」），取最先出現的縣市名
        found = sorted((fragments.index(name), -len(name), name) for name in cities if name in fragments)
        city = found[0][2] if found else ""
        if not city:
            raise ValueError(f"{districts[0][0]} 找不到所屬縣市（表格讀到的縣市名片段：{fragments}）")
        rows.extend([city, *row] for row in districts)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path, help="中選會選舉區劃分公告 PDF")
    parser.add_argument("--as-of", required=True, help="公告發文日期，例如 2026-08-20")
    args = parser.parse_args()

    records = []
    for city, district, scope, seats in read_rows(args.pdf):
        kind = district_type(scope)
        prefix, units = ("", []) if kind != "區域" else split_units(scope)
        records.append({
            "city": city,
            "district": city + district,
            "district_type": kind,
            "scope": scope,
            "scope_prefix": prefix,
            "units": "|".join(units),
            "unit_level": unit_level(units) if units else "",
            "seats": seats,
            "source_title": SOURCE_TITLE,
            "source_url": SOURCE_URL,
            "as_of": args.as_of,
        })

    names = [record["district"] for record in records]
    if len(names) != len(set(names)):
        raise ValueError("選舉區名稱重複")
    roster = {row["district"] for row in csv.DictReader(ROSTER.open(encoding="utf-8")) if row["office"] == "縣市議員"}
    missing, extra = roster - set(names), set(names) - roster
    if missing or extra:
        raise ValueError(f"與候選人名冊的選舉區對不起來：名冊有公告沒有={sorted(missing)}，公告有名冊沒有={sorted(extra)}")
    if len(records) != EXPECTED_DISTRICTS:
        raise ValueError(f"選舉區數不符：讀到 {len(records)}，應為 {EXPECTED_DISTRICTS}")

    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    regional = [record for record in records if record["district_type"] == "區域"]
    village = [record for record in regional if record["unit_level"] == "村里"]
    print(f"寫入 {OUT.relative_to(ROOT)}：{len(records)} 個選舉區"
          f"（區域 {len(regional)}、原住民 {len(records) - len(regional)}；"
          f"其中以村里劃分 {len(village)} 個）")


if __name__ == "__main__":
    main()
