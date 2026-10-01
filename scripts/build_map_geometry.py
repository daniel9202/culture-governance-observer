"""產生文化政見地圖使用的縣市界線 SVG 路徑（map-geometry.json）。

來源：內政部國土測繪中心「直轄市、縣市界線（TWD97 經緯度）」
https://data.gov.tw/dataset/7442 （COUNTY_MOI_1140318）

原始 shapefile 不納入版本庫；需要更新界線時，將解壓後的檔案放在
tmp/admin-map/source/ 後執行：

    py -3 scripts/build_map_geometry.py

外島只以附圖呈現澎湖本島、大小金門與馬祖南北竿；其餘外島（龜山島、綠島、
蘭嶼、小琉球、望安、七美、烏坵、莒光、東引、東沙、南沙、釣魚臺列嶼等）依
專案需求不繪入，頁面註記中須說明。
"""
from pathlib import Path
import json
import math
import struct

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tmp" / "admin-map" / "source"
OUT = ROOT / "map-geometry.json"

VIEW_W, VIEW_H = 560, 760
# 主圖經緯度範圍與投影（等距圓柱，以北緯 23.7 度校正經度比例）
LON0, LON1, LAT0, LAT1 = 119.25, 122.08, 21.86, 25.33
COS = math.cos(math.radians(23.7))
SCALE = min((VIEW_W - 20) / ((LON1 - LON0) * COS), (VIEW_H - 20) / (LAT1 - LAT0))
OFFSET_X = VIEW_W - 10 - (LON1 - LON0) * COS * SCALE
OFFSET_Y = 10
# 附圖：box 為畫面上的框（x, y, 寬, 高）；keep(經度, 緯度, 面積) 決定保留哪些島嶼。
# 依專案需求，馬祖只畫南竿、北竿，澎湖只畫本島（含相連的白沙、西嶼），金門畫大、小金門。
INSETS = {
    "連江縣": {"box": (12, 24, 150, 122), "label": "連江縣（馬祖）", "label_at": (154, 138, "end"),
              "keep": lambda lon, lat, a: a > 5e-4,
              # 示意圖：北竿往南竿方向平移以縮短間距（非實際距離）
              "shift": lambda lon, lat, a: (-0.022, -0.02) if lat > 26.19 else (0, 0)},
    "金門縣": {"box": (12, 158, 150, 92), "label": "金門縣", "label_at": (18, 174, "start"),
              "keep": lambda lon, lat, a: lon < 119 and a > 1e-5},
    "澎湖縣": {"box": (12, 262, 150, 172), "label": "澎湖縣", "label_at": (18, 278, "start"),
              "keep": lambda lon, lat, a: a > 5e-3},
}
# 小型市改以引線標註於海面，數值為標籤座標（畫面座標）
CALLOUT = {"基隆市": (532, 40), "臺北市": (398, 36), "新竹市": (300, 112), "嘉義市": (160, 452)}


def dbf_rows(path):
    raw = path.read_bytes()
    count, header_length, record_length = struct.unpack("<xxxxIHH20x", raw[:32])
    fields, offset = [], 32
    while raw[offset] != 13:
        fields.append((raw[offset:offset + 11].split(b"\0", 1)[0].decode("ascii"), raw[offset + 16]))
        offset += 32
    rows = []
    for index in range(count):
        row = raw[header_length + index * record_length:header_length + (index + 1) * record_length]
        cursor, values = 1, {}
        for name, length in fields:
            values[name] = row[cursor:cursor + length].decode("utf-8").strip()
            cursor += length
        rows.append(values)
    return rows


def shp_rows(path):
    raw = path.read_bytes()
    offset, shapes = 100, []
    while offset < len(raw):
        _, length = struct.unpack(">2i", raw[offset:offset + 8])
        content = raw[offset + 8:offset + 8 + length * 2]
        offset += 8 + length * 2
        if struct.unpack("<i", content[:4])[0] != 5:
            shapes.append([])
            continue
        num_parts, num_points = struct.unpack("<2i", content[36:44])
        parts = struct.unpack(f"<{num_parts}i", content[44:44 + 4 * num_parts])
        start = 44 + 4 * num_parts
        points = [struct.unpack("<2d", content[start + i * 16:start + (i + 1) * 16]) for i in range(num_points)]
        shapes.append([points[parts[i]:(parts[i + 1] if i + 1 < num_parts else num_points)] for i in range(num_parts)])
    return shapes


def area(points):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1]))) / 2


def centroid(points):
    a = cx = cy = 0
    for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1]):
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if a == 0:
        return points[0]
    return cx / (3 * a), cy / (3 * a)


def simplify(points, tolerance):
    """Douglas–Peucker；輸入為已投影的畫面座標。"""
    if len(points) < 5:
        return points

    def distance(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == dy == 0:
            return math.hypot(p[0] - a[0], p[1] - a[1])
        return abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / math.hypot(dx, dy)

    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        best, index = 0, None
        for i in range(first + 1, last):
            d = distance(points[i], points[first], points[last])
            if d > best:
                best, index = d, i
        if index is not None and best > tolerance:
            keep.add(index)
            stack += [(first, index), (index, last)]
    return [points[i] for i in sorted(keep)]


def to_path(rings):
    return "".join(
        "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ring) + "Z" for ring in rings if len(ring) >= 3
    )


def main_project(lon, lat):
    return OFFSET_X + (lon - LON0) * COS * SCALE, OFFSET_Y + (LAT1 - lat) * SCALE


def bbox(parts):
    xs = [x for part in parts for x, _ in part]
    ys = [y for part in parts for _, y in part]
    return min(xs), min(ys), max(xs), max(ys)


def inset_parts(parts, inset):
    pad = 8
    centre = lambda p: (sum(x for x, _ in p) / len(p), sum(y for _, y in p) / len(p))
    kept = [p for p in parts if inset["keep"](*centre(p), area(p))]
    shift = inset.get("shift")
    if shift:
        moved = []
        for p in kept:
            dx, dy = shift(*centre(p), area(p))
            moved.append([(x + dx, y + dy) for x, y in p])
        kept = moved
    bx, by, bw, bh = inset["box"]
    x0, y0, x1, y1 = bbox(kept)
    k = min((bw - pad * 2) / ((x1 - x0) * COS), (bh - pad * 2) / (y1 - y0))
    ox = bx + (bw - (x1 - x0) * COS * k) / 2
    oy = by + (bh - (y1 - y0) * k) / 2
    return kept, lambda lon, lat: (ox + (lon - x0) * COS * k, oy + (y1 - lat) * k)


def build():
    rows = dbf_rows(next(SOURCE.glob("*.dbf")))
    shapes = shp_rows(next(SOURCE.glob("*.shp")))
    counties = []
    for row, parts in zip(rows, shapes):
        name = row["COUNTYNAME"]
        inset = INSETS.get(name)
        if inset:
            groups = [inset_parts(parts, inset)]
        else:
            groups = [([p for p in parts if all(LON0 <= x <= LON1 and LAT0 <= y <= LAT1 for x, y in p[:1])], main_project)]
        rings = []
        for part, project in ((p, f) for members, f in groups for p in members):
            screen = [project(x, y) for x, y in part]
            # 去除畫面上小於約 0.6 平方像素的礁岩
            if area(screen) < 0.6:
                continue
            rings.append(simplify(screen, 0.45))
        largest = max(rings, key=area)
        if not inset:
            # 本島縣市只留本島範圍（最大環與大型內環，例如新北市圍住臺北市的邊界）
            rings = [ring for ring in rings if ring is largest or area(ring) >= 400]
        cx, cy = centroid(largest)
        if inset:
            bx, by, bw, bh = inset["box"]
            cx, cy = bx + bw / 2, by + bh / 2
        county = {
            "name": name,
            "code": row["COUNTYCODE"],
            "d": to_path(rings),
            "anchor": [round(cx, 1), round(cy, 1)],
        }
        if name in CALLOUT:
            county["callout"] = list(CALLOUT[name])
        counties.append(county)
    data = {
        "source": "內政部國土測繪中心 直轄市、縣市界線（TWD97 經緯度）COUNTY_MOI_1140318",
        "source_url": "https://data.gov.tw/dataset/7442",
        "viewBox": [0, 0, VIEW_W, VIEW_H],
        "insets": [{"name": n, "box": v["box"], "label": v["label"], "label_at": v["label_at"]} for n, v in INSETS.items()],
        "counties": sorted(counties, key=lambda c: c["code"]),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(counties)} counties, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    build()
