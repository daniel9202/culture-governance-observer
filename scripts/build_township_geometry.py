"""產生縣轄市的 SVG 路徑（township-geometry.json）。

縣轄市在縣以下，縣市底圖沒有對應範圍，但地圖是進站入口，需要能從縣點進去。
只畫有縣轄市長選舉的 14 個市，投影、附圖與簡化參數沿用 scripts/build_map_geometry.py，
所以可以直接疊在縣市底圖上。

來源：內政部國土測繪中心「鄉鎮市區界線（TWD97 經緯度）」
https://data.gov.tw/dataset/7441 （TOWN_MOI_1140318）

原始 shapefile 不納入版本庫；解壓後放在 tmp/admin-map/town/ 再執行：

    py -3 scripts/build_township_geometry.py

縣轄市名單取自 data/input/registered_candidates.csv 的縣轄市長列，名冊換屆時自動跟著變。
"""
from pathlib import Path
import csv
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_map_geometry import (  # noqa: E402  共用投影、附圖與簡化設定
    INSETS, VIEW_W, VIEW_H, LON0, LON1, LAT0, LAT1,
    area, centroid, dbf_rows, inset_parts, main_project, shp_rows, to_path,
)
from build_district_geometry import (  # noqa: E402  共用底圖比對與附圖處理
    TOWN_KEEP, county_rings, inside, inset_filter, project_rings,
)

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tmp" / "admin-map" / "town"
REGISTERED = ROOT / "data" / "input" / "registered_candidates.csv"
OUT = ROOT / "township-geometry.json"


def county_cities():
    """(縣, 市) 清單，取自名冊的縣轄市長列。"""
    rows = csv.DictReader(REGISTERED.open(encoding="utf-8-sig"))
    return sorted({(row["city"], row["district"]) for row in rows if row["office"] == "縣轄市長"})


def main():
    rows = dbf_rows(next(SOURCE.glob("*.dbf")))
    shapes = shp_rows(next(SOURCE.glob("*.shp")))
    towns = {(row["COUNTYNAME"], row["TOWNNAME"]): parts for row, parts in zip(rows, shapes)}
    by_county = {}
    for (county, _), parts in towns.items():
        by_county.setdefault(county, []).extend(parts)
    town_inset = {name: {**inset, "keep": TOWN_KEEP.get(name, inset["keep"])} for name, inset in INSETS.items()}
    inset_projection = {name: inset_parts(by_county[name], inset)[1]
                        for name, inset in town_inset.items() if by_county.get(name)}
    basemap = {county["name"]: county_rings(county["d"])
               for county in json.loads((ROOT / "map-geometry.json").read_text(encoding="utf-8"))["counties"]}

    townships, missing = [], []
    for county, town in county_cities():
        parts = towns.get((county, town))
        if not parts:
            missing.append({"city": county, "town": town, "reason": "鄉鎮市區界線查無此名稱"})
            continue
        inset = town_inset.get(county)
        if inset:
            kept = inset_filter(parts, inset)
            if not kept:
                missing.append({"city": county, "town": town, "reason": "所屬離島未繪入底圖"})
                continue
            rings = project_rings(kept, inset_projection[county])
        else:
            inland = [p for p in parts if all(LON0 <= x <= LON1 and LAT0 <= y <= LAT1 for x, y in p[:1])]
            rings = [ring for ring in project_rings(inland, main_project) if inside(centroid(ring), basemap[county])]
        if not rings:
            missing.append({"city": county, "town": town, "reason": "投影後沒有可繪的範圍"})
            continue
        largest = max(rings, key=area)
        rings = [ring for ring in rings if ring is largest or area(ring) >= 4]
        cx, cy = centroid(largest)
        townships.append({
            "id": f"{county}{town}", "city": county, "town": town,
            "d": to_path(rings), "anchor": [round(cx, 1), round(cy, 1)],
        })

    data = {
        "source": "內政部國土測繪中心 鄉鎮市區界線（TWD97 經緯度）TOWN_MOI_1140318",
        "source_url": "https://data.gov.tw/dataset/7441",
        "viewBox": [0, 0, VIEW_W, VIEW_H],
        "townships": townships,
        "missing": missing,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"寫入 {OUT.name}：{len(townships)} 個縣轄市有圖形"
          + (f"，{len(missing)} 個沒有（{'、'.join(m['town'] for m in missing)}）" if missing else ""))


if __name__ == "__main__":
    main()
