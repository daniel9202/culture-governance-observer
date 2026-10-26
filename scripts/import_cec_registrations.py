"""把中選會「候選人登記彙總表」PDF 轉成 data/input/registered_candidates.csv。

來源：中央選舉委員會「115年地方公職人員選舉候選人登記名冊」
https://web.cec.gov.tw/central/article/64709

需要的附件（下載後放在同一資料夾，檔名保持如下）：
    1-1.pdf  直轄市長選舉候選人登記彙總表
    2-1.pdf  直轄市議員選舉候選人登記彙總表
    3-1.pdf  縣市長選舉候選人登記彙總表
    4-1.pdf  縣市議員選舉候選人登記彙總表

PDF 不納入版本庫。執行（需 pdfplumber）：

    py -3 scripts/import_cec_registrations.py <PDF 資料夾> --as-of 2026-09-07

115/10/16 中選會審定公告後，已直接從 data/input/registered_candidates.csv 刪除 10 位不符規定者，
並把全表的來源改為審定公告（2026-10-16）。**重跑此腳本會依 9/7 登記名冊還原那 10 人**，
若要重跑，請改用中選會的審定名冊，或重跑後再依審定公告刪除一次。
"""
from pathlib import Path
import argparse
import csv
import re

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "input" / "registered_candidates.csv"
SOURCE_TITLE = "中央選舉委員會：115年地方公職人員選舉候選人登記名冊"
SOURCE_URL = "https://web.cec.gov.tw/central/article/64709"
FILES = [("1-1.pdf", "縣市長"), ("3-1.pdf", "縣市長"), ("2-1.pdf", "縣市議員"), ("4-1.pdf", "縣市議員")]
# 鄉鎮市長彙總表（7-1.pdf）只取 14 個縣轄市；鄉長、鎮長不收錄，見 AGENTS.md 的收錄範圍。
TOWNSHIP_FILE = ("7-1.pdf", "縣轄市長")
COUNTY_CITIES = {
    "竹北市", "頭份市", "苗栗市", "彰化市", "員林市", "南投市", "斗六市",
    "太保市", "朴子市", "屏東市", "宜蘭市", "花蓮市", "臺東市", "馬公市",
}
TOWNSHIP_SOURCE_TITLE = "中央選舉委員會：115年鄉鎮市長選舉候選人登記彙總表"
# 這張表是登記彙總（115.09.07 製表），不是審定名單；鄉鎮市長的資格審定由各縣選委會辦理，
# 與四合一選舉的審定公告分開，所以來源與 as_of 都和其餘職務不同。

EXPECTED = {"1-1.pdf": 23, "2-1.pdf": 610, "3-1.pdf": 58, "4-1.pdf": 892}  # 中選會 115.09.07 新聞稿
FIELDS = ["city", "office", "district", "candidate", "party", "registered_date", "incumbent", "source_title", "source_url", "as_of"]

# 僅作地圖樣式使用：依 2026-10-10 的現任職務與中選會登記名冊判定。
INCUMBENT_MAYORS = {
    "臺北市": "蔣萬安", "桃園市": "張善政", "基隆市": "謝國樑", "新竹市": "高虹安",
    "苗栗縣": "鍾東錦", "南投縣": "許淑華", "屏東縣": "周春米", "連江縣": "王忠銘",
}


def roc_date(value):
    year, month, day = (int(part) for part in value.strip().split("/"))
    return f"{year + 1911:04d}-{month:02d}-{day:02d}"


def extract(path):
    rows = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    cells = [(cell or "").replace("\n", "").strip() for cell in row]
                    if cells and cells[0] and cells[0] != "選舉區":
                        rows.append(cells)
    return rows


def township_mayors(path, as_of):
    """鄉鎮市長彙總表裡的 14 個縣轄市；鄉長、鎮長不收。"""
    records = []
    for district, registered, candidate, party, *_ in extract(path):
        # 選舉區欄位是「新竹縣竹北市」這種縣名加鄉鎮市名的寫法
        match = re.match(r"^(\S+?縣)(\S+)$", district)
        if not match or match.group(2) not in COUNTY_CITIES:
            continue
        county, town = match.groups()
        records.append({
            "city": county,
            "office": TOWNSHIP_FILE[1],
            "district": town,
            "candidate": candidate,
            "party": party,
            "registered_date": roc_date(registered),
            "incumbent": "",
            "source_title": TOWNSHIP_SOURCE_TITLE,
            "source_url": SOURCE_URL,
            "as_of": as_of,
        })
    return records


def append_township(path, as_of):
    """只替換既有 CSV 裡的縣轄市長列，其餘職務不動。

    主表已依審定公告刪除 10 位不符規定者，整份重跑會把他們救回來，
    所以縣轄市長一律用這個附加模式寫入。
    """
    existing = [row for row in csv.DictReader(OUT.open(encoding="utf-8-sig")) if row["office"] != TOWNSHIP_FILE[1]]
    records = township_mayors(path, as_of)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(existing + records)
    print(f"wrote {OUT.relative_to(ROOT)}: 既有 {len(existing)} 筆 + 縣轄市長 {len(records)} 筆")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_dir", type=Path)
    parser.add_argument("--as-of", required=True, help="名冊製表日期 YYYY-MM-DD")
    parser.add_argument("--township-only", action="store_true",
                        help="只從 7-1.pdf 匯入 14 個縣轄市的市長，附加到既有 CSV，不重建其他職務")
    args = parser.parse_args()
    if args.township_only:
        append_township(args.pdf_dir / TOWNSHIP_FILE[0], args.as_of)
        return
    records = []
    for name, office in FILES:
        rows = extract(args.pdf_dir / name)
        if name in EXPECTED and len(rows) != EXPECTED[name]:
            raise SystemExit(f"{name}: 解析出 {len(rows)} 筆，與中選會公布的 {EXPECTED[name]} 筆不符")
        for district, registered, candidate, party, *_ in rows:
            city = re.sub(r"第\d+選舉區$", "", district)
            records.append({
                "city": city,
                "office": office,
                "district": district,
                "candidate": candidate,
                "party": party,
                "registered_date": roc_date(registered),
                "incumbent": "是" if office == "縣市長" and INCUMBENT_MAYORS.get(city) == candidate else "",
                "source_title": SOURCE_TITLE,
                "source_url": SOURCE_URL,
                "as_of": args.as_of,
            })
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
    print(f"wrote {OUT.relative_to(ROOT)}: {len(records)} rows")


if __name__ == "__main__":
    main()
