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

資格審查（10/16）與號次抽籤（10/23）後，若中選會公布審定名單，改用新檔案重跑並更新 --as-of 與 SOURCE_URL。
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_dir", type=Path)
    parser.add_argument("--as-of", required=True, help="名冊製表日期 YYYY-MM-DD")
    args = parser.parse_args()
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
