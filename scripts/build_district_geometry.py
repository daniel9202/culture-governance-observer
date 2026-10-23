"""產生議員選舉區的 SVG 路徑（district-geometry.json）。

把鄉鎮市區界線依 config/election_districts.csv 合併成選舉區：同一選舉區內部、
被兩個鄉鎮共用的邊界去掉，剩下的邊接成外框。投影、附圖與簡化參數沿用
scripts/build_map_geometry.py，所以可以直接疊在縣市底圖上。

來源：內政部國土測繪中心「鄉鎮市區界線（TWD97 經緯度）」
https://data.gov.tw/dataset/7441 （TOWN_MOI_1140318）

原始 shapefile 不納入版本庫；解壓後放在 tmp/admin-map/town/ 再執行：

    py -3 scripts/build_district_geometry.py

畫不出來的選舉區會列在輸出的 undrawn：
- 新竹市 5 區與新竹縣第1、2選舉區以村里劃分，需要村里界圖資（data.gov.tw/dataset/7438）；
  這兩處改以整個鄉鎮市區範圍呈現，不細分。
- 原住民選舉區依身分別劃分，範圍與區域選舉區重疊，本來就不是互斥的區塊，不畫。
- 連江縣莒光鄉、東引鄉等未繪入底圖的離島，對應選舉區同樣沒有圖形。
"""
from pathlib import Path
import collections
import csv
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_map_geometry import (  # noqa: E402  共用投影、附圖與簡化設定
    INSETS, VIEW_W, VIEW_H, LON0, LON1, LAT0, LAT1,
    area, centroid, dbf_rows, inset_parts, main_project, shp_rows, simplify, to_path,
)

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tmp" / "admin-map" / "town"
# 附圖的保留門檻是依縣市整體的多邊形訂的，換成鄉鎮市區後面積變小，澎湖要放寬；
# 放寬後保留的仍是馬公、湖西、白沙、西嶼（不含望安、七美），與縣市底圖一致。
# 連江（只留南北竿）與金門（排除烏坵）的門檻在鄉鎮市區層級仍然正確，不調整。
TOWN_KEEP = {"澎湖縣": lambda lon, lat, a: a > 1e-3}
DISTRICTS = ROOT / "config" / "election_districts.csv"
OUT = ROOT / "district-geometry.json"


def outline(parts):
    """多個鄉鎮市區的環合併成外框：只出現一次的邊才是外框，接成封閉環。"""
    counts = collections.Counter()
    for ring in parts:
        for edge in zip(ring, ring[1:]):
            counts[frozenset(edge)] += 1
    links = collections.defaultdict(list)
    for edge, count in counts.items():
        if count == 1:
            a, b = tuple(edge)
            links[a].append(b)
            links[b].append(a)
    rings, used = [], set()
    for start in list(links):
        if start in used:
            continue
        ring, point, previous = [start], start, None
        used.add(start)
        while True:
            nexts = [p for p in links[point] if p != previous and (p not in used or p == start)]
            if not nexts:
                break
            following = nexts[0]
            if following == start:
                break
            ring.append(following)
            used.add(following)
            point, previous = following, point
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def county_rings(path):
    """把 map-geometry.json 的縣市路徑解析回畫面座標的環。"""
    rings = []
    for chunk in path.split("M")[1:]:
        points = [tuple(float(v) for v in pair.split(",")) for pair in chunk.rstrip("Z").split("L")]
        if len(points) >= 3:
            rings.append(points)
    return rings


def inside(point, rings):
    """射線法；縣市路徑含外環與內環（例如新北市圍住臺北市），用奇偶規則判斷。"""
    x, y = point
    hits = 0
    for ring in rings:
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            if (y0 > y) != (y1 > y) and x < x0 + (y - y0) / (y1 - y0) * (x1 - x0):
                hits += 1
    return hits % 2 == 1


def inset_filter(parts, inset):
    """附圖只畫指定的島；平移是示意用，與 build_map_geometry 的規則相同。"""
    centre = lambda ring: (sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring))
    kept = [ring for ring in parts if inset["keep"](*centre(ring), area(ring))]
    shift = inset.get("shift")
    if not shift:
        return kept
    moved = []
    for ring in kept:
        dx, dy = shift(*centre(ring), area(ring))
        moved.append([(x + dx, y + dy) for x, y in ring])
    return moved


def project_rings(rings, project, min_area=0.6, tolerance=0.45):
    screen = []
    for ring in rings:
        points = [project(x, y) for x, y in ring]
        if area(points) < min_area:
            continue
        screen.append(simplify(points, tolerance))
    return screen


def main():
    rows = dbf_rows(next(SOURCE.glob("*.dbf")))
    shapes = shp_rows(next(SOURCE.glob("*.shp")))
    towns = {(row["COUNTYNAME"], row["TOWNNAME"]): parts for row, parts in zip(rows, shapes)}
    by_county = collections.defaultdict(list)
    for (county, _), parts in towns.items():
        by_county[county].extend(parts)
    # 離島附圖的縮放要以整個縣為準，否則各選舉區會各自放大到填滿方框
    town_inset = {name: {**inset, "keep": TOWN_KEEP.get(name, inset["keep"])} for name, inset in INSETS.items()}
    inset_projection = {name: inset_parts(by_county[name], inset)[1]
                        for name, inset in town_inset.items() if by_county.get(name)}

    basemap = {county["name"]: county_rings(county["d"])
               for county in json.loads((ROOT / "map-geometry.json").read_text(encoding="utf-8"))["counties"]}
    districts, undrawn = [], []
    for row in csv.DictReader(DISTRICTS.open(encoding="utf-8")):
        if row["district_type"] != "區域":
            undrawn.append({"district": row["district"], "reason": "原住民選舉區依身分別劃分，與區域選舉區重疊"})
            continue
        if row["unit_level"] == "村里":
            # 以村里劃分：沒有村里圖資，改用整個鄉鎮市區的範圍，不細分
            names = [row["scope_prefix"]] if row["scope_prefix"] else [
                name for (county, name) in towns if county == row["city"]]
            undrawn.append({"district": row["district"], "reason": "以村里劃分，缺村里界圖資，與同鎮市其他選舉區共用範圍"})
        else:
            names = row["units"].split("|")
        parts = [ring for name in names for ring in towns.get((row["city"], name), [])]
        if not parts:
            continue
        inset = town_inset.get(row["city"])
        if inset:
            kept = inset_filter(parts, inset)
            if not kept:
                undrawn.append({"district": row["district"], "reason": "所屬離島未繪入底圖"})
                continue
            rings = project_rings(outline(kept), inset_projection[row["city"]])
        else:
            inland = [p for p in parts if all(LON0 <= x <= LON1 and LAT0 <= y <= LAT1 for x, y in p[:1])]
            # 縣市底圖不繪入綠島、蘭嶼、小琉球、龜山島等外島，選舉區層跟著排除，
            # 否則會出現底圖沒有、只有選區界線的孤島（面積擋不掉：琉球鄉和永和區差不多大）
            drawn = basemap[row["city"]]
            rings = [ring for ring in project_rings(outline(inland), main_project)
                     if inside(centroid(ring), drawn)]
        if not rings:
            undrawn.append({"district": row["district"], "reason": "所屬離島未繪入底圖"})
            continue
        largest = max(rings, key=area)
        rings = [ring for ring in rings if ring is largest or area(ring) >= 4]
        cx, cy = centroid(largest)
        districts.append({
            "district": row["district"], "city": row["city"],
            "seats": int(row["seats"]), "approximate": row["unit_level"] == "村里",
            "d": to_path(rings), "anchor": [round(cx, 1), round(cy, 1)],
        })

    data = {
        "source": "內政部國土測繪中心 鄉鎮市區界線（TWD97 經緯度）TOWN_MOI_1140318",
        "source_url": "https://data.gov.tw/dataset/7441",
        "districts_source": "中央選舉委員會 115年10月16日審定之選舉區劃分（中選務字第1153150253號公告）",
        "viewBox": [0, 0, VIEW_W, VIEW_H],
        "districts": districts,
        "undrawn": undrawn,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"寫入 {OUT.name}：{len(districts)} 個選舉區有圖形，{len(undrawn)} 個沒有"
          f"（其中以村里劃分 {sum(1 for d in districts if d['approximate'])} 個以整個鄉鎮市區呈現）")


if __name__ == "__main__":
    main()
