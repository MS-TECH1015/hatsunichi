"""市の地図（1 単位 50 m）に置く、実在の建物。LLM は使わない。

入力
- data/raw/osm/chugoku-261105.osm.pbf（OpenStreetMap、Geofabrik が配る中国地方の 1 ファイル、2026-11-05 までのデータ、ODbL 1.0）。主に使う
- data/raw/gsi_vt/16_*.pbf（国土地理院の最適化ベクトルタイル、取れた 707 枚）。OSM の建物の無い所だけ埋める
出力: public/city/buildings.bin。1 棟 6 個の int16 で、中心の x・z（m、鳥取駅から東と南）、向き（1/1000 ラジアン）、
      幅・奥行き（外周に沿った長方形、0.1 m）、高さ（0.1 m）。OSM 由来を含むので、このファイルは ODbL 1.0
高さは OSM の height、無ければ building:levels × 3 m + 1 m、無ければ建物の種類からの推定。地理院の分は build_real_towns.py の GSI_HEIGHT
市の外の建物は、鳥取市の大字・町丁の点（位置参照情報）から 2 km より遠いものとして外す。境の近くでは隣の町の建物が少し入る
"""
import csv
import io
import math
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import plateau  # noqa: E402
from build_city import M_PER_UNIT, to_unit  # noqa: E402
from build_real_towns import GSI_HEIGHT  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
GSI_VT = ROOT / "data" / "raw" / "gsi_vt"
ISJ = ROOT / "data" / "raw" / "isj" / "31000-19.0b" / "31_2025.csv"
OUT = ROOT / "public" / "city" / "buildings.bin"
OSM = ROOT / "data" / "raw" / "osm" / "chugoku-261105.osm.pbf"
NEAR_M = 2000
MIN_M2 = 6
FILL_M = 15  # 地理院の建物の中心からこの距離に OSM の建物の中心があれば、同じ建物として地理院の分を捨てる
LOW = {"shed", "garage", "garages", "carport", "roof", "hut", "greenhouse", "cabin", "barn", "farm_auxiliary", "toilets", "kiosk"}
TALL = {"apartments", "commercial", "retail", "office", "hospital", "school", "university", "hotel", "public", "civic", "government", "industrial", "warehouse", "train_station", "dormitory"}


def town_points():
    rows = csv.reader(io.TextIOWrapper(open(ISJ, "rb"), encoding="cp932"))
    return np.array([[v * M_PER_UNIT for v in to_unit(float(r[6]), float(r[7]))] for r in rows if r[2] == "31201"])


def box(pts):
    """外周の点（m）から、長い辺に沿った長方形の中心・向き・幅・奥行き"""
    p = np.array(pts)
    edges = np.diff(np.vstack([p, p[:1]]), axis=0)
    longest = edges[np.argmax(np.hypot(edges[:, 0], edges[:, 1]))]
    a = math.atan2(longest[1], longest[0])
    u = np.array([math.cos(a), math.sin(a)])
    v = np.array([-u[1], u[0]])
    pu, pv = p @ u, p @ v
    c = u * (pu.max() + pu.min()) / 2 + v * (pv.max() + pv.min()) / 2
    return c, a, pu.max() - pu.min(), pv.max() - pv.min()


def osm_height(tags):
    try:
        return float(tags.get("height", "").replace("m", "").strip())
    except ValueError:
        pass
    try:
        return float(tags.get("building:levels", "")) * 3 + 1
    except ValueError:
        pass
    kind = tags.get("building")
    return 3.5 if kind in LOW else 10.0 if kind in TALL else 6.0


def osm_buildings(near):
    import osmium

    out = []
    for w in osmium.FileProcessor(str(OSM)).with_locations().with_filter(osmium.filter.KeyFilter("building")):
        if not isinstance(w, osmium.osm.Way) or len(w.nodes) < 4:
            continue
        try:
            ring = [(n.lat, n.lon) for n in w.nodes]
        except osmium.InvalidLocationError:
            continue
        if not (34.9 < ring[0][0] < 35.7 and 133.8 < ring[0][1] < 134.6):
            continue
        pts = [[v * M_PER_UNIT for v in to_unit(a, b)] for a, b in ring[:-1]]
        c, a, wd, d = box(pts)
        if wd * d < MIN_M2 or np.hypot(*(near - c).T).min() > NEAR_M:
            continue
        out.append((c, a, wd, d, osm_height(dict(w.tags))))
    return out


def gsi_buildings(near):
    out = []
    for f in sorted(GSI_VT.glob("16_*.pbf")):
        z, x, y = map(int, f.stem.split("_"))
        n = 2 ** z
        west, east = x / n * 360 - 180, (x + 1) / n * 360 - 180
        north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
        south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
        for name, props, parts in plateau.decode_mvt(f.read_bytes(), z, x, y, kinds=(3,)):
            if name != "BldA":
                continue
            for ring in parts:
                lat = sum(p[0] for p in ring) / len(ring)
                lon = sum(p[1] for p in ring) / len(ring)
                if not (south <= lat < north and west <= lon < east):
                    continue  # タイルの縁で隣と重なる分
                pts = [[v * M_PER_UNIT for v in to_unit(a, b)] for a, b in ring]
                c, a, w, d = box(pts)
                if w * d < MIN_M2 or np.hypot(*(near - c).T).min() > NEAR_M:
                    continue
                out.append((c, a, w, d, GSI_HEIGHT.get(props.get("vt_code"), 6.0)))
    return out


def main():
    near = town_points()
    osm = osm_buildings(near)
    cells = {(int(c[0] // FILL_M), int(c[1] // FILL_M)) for c, *_ in osm}
    gsi = [g for g in gsi_buildings(near) if not any((int(g[0][0] // FILL_M) + i, int(g[0][1] // FILL_M) + j) in cells for i in (-1, 0, 1) for j in (-1, 0, 1))]
    rows = [[round(c[0]), round(c[1]), round(a * 1000), min(round(w * 10), 32767), min(round(d * 10), 32767), min(round(h * 10), 32767)] for c, a, w, d, h in osm + gsi]
    arr = np.array([r for r in rows if abs(r[0]) < 32767 and abs(r[1]) < 32767], dtype=np.int16)
    OUT.write_bytes(arr.tobytes())
    print("osm", len(osm), "gsi fill", len(gsi), "buildings", len(arr), "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
