"""9 つの町の中を、実在の建物・道・川・鉄道の形と位置で組む。LLM は使わない。

入力: PLATEAU 鳥取市 2020（scripts/plateau.py）。PLATEAU の建物がほとんど無い町（GSI_TOWNS）は、建物・道路・水面・鉄道を
国土地理院の最適化ベクトルタイル（scripts/fetch_gsi_vt.py が落とした data/raw/gsi_vt）から組む。土地利用は PLATEAU のある所だけ。
出力: public/city/towns/<町>.json。座標は町の中（data/world.json の places[].geo が原点、+x 東、+z 南）、
1 単位 = M_PER_UNIT m。人と飾りの模型はこの縮尺で人の背が 2.8 m ほどになり、建物より少し大きく見える。
"""
import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import plateau  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "city" / "towns"
M_PER_UNIT = 1.5
R_BLDG = 600  # 建物を置く半径（m）
GROUND_EXTRA = 160  # 地面を町の円の外へのばす幅（単位）。src/components/town/realTown.ts の OUTSIDE と同じ
GROUND_CELL = 8  # 地面の高さの格子の間隔（単位）
DEM = ROOT / "data" / "raw" / "dem"
GSI_VT = ROOT / "data" / "raw" / "gsi_vt"
# PLATEAU 2020 の建物が 0〜34 しかない町。地理院のベクトルタイルで組む
GSI_TOWNS = {"fukube", "ketaka", "kokufu", "mochigase", "sakyu", "aoya"}
# 地理院の建物は高さを持たない。種類から置いた推定（m）: 普通建物、堅ろう建物、普通無壁舎、堅ろう無壁舎
GSI_HEIGHT = {3101: 6.0, 3102: 10.0, 3111: 3.5, 3112: 4.5}
# 道路の幅の区分（vt_rnkwidth）を、区分の中ほどの幅（m）に置き換える
GSI_ROAD_W = {"3m未満": 2.5, "3m-5.5m未満": 4.5, "5.5m-13m未満": 8.0, "13m-19.5m未満": 15.0, "19.5m以上": 20.0}


class Frame:
    """緯度経度と町の中の座標（単位）の行き来"""

    def __init__(self, lat, lon):
        self.lat, self.lon = lat, lon
        self.kx = 111320 * math.cos(math.radians(lat)) / M_PER_UNIT
        self.kz = 110950 / M_PER_UNIT

    def to_local(self, lat, lon):
        return (lon - self.lon) * self.kx, -(lat - self.lat) * self.kz


def ring_of(tris, verts):
    """三角形の集まりの外周。辺が 1 回しか出ないものをつないだ一番長い輪"""
    count = {}
    for t in tris:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            key = (min(a, b), max(a, b))
            count[key] = count.get(key, 0) + 1
    edges = [k for k, c in count.items() if c == 1]
    nxt = {}
    for a, b in edges:
        nxt.setdefault(a, []).append(b)
        nxt.setdefault(b, []).append(a)
    best = []
    seen = set()
    for start in nxt:
        if start in seen:
            continue
        ring, prev, cur = [start], None, start
        seen.add(start)
        while True:
            options = [v for v in nxt[cur] if v != prev and v not in seen]
            if not options:
                break
            prev, cur = cur, options[0]
            seen.add(cur)
            ring.append(cur)
        if len(ring) > len(best):
            best = ring
    return [verts[i] for i in best]


def simplify(pts, tol):
    if len(pts) < 4:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    n = np.hypot(*ab) or 1e-9
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], tol)[:-1] + simplify(pts[i:], tol)


def area(ring):
    x = np.array([p[0] for p in ring])
    z = np.array([p[1] for p in ring])
    return 0.5 * (np.dot(x, np.roll(z, -1)) - np.dot(z, np.roll(x, -1)))


def plateau_buildings(frame, r_units):
    """PLATEAU の建物を、町の中の外周（単位）と高さ（m）で返す"""
    lat0, lon0 = frame.lat, frame.lon
    dl = R_BLDG / 111000 * 1.2
    dn = R_BLDG / (111000 * math.cos(math.radians(lat0))) * 1.2
    out, seen = [], set()
    for uri, w, s, e, n in plateau.tiles():
        if not (w < lon0 + dn and e > lon0 - dn and s < lat0 + dl and n > lat0 - dl):
            continue
        geo, table = plateau.read_b3dm(uri)
        ids = table.get("_gml_id") or []
        for k, (g, tris) in geo.items():
            gid = ids[k] if k < len(ids) else f"{uri}:{k}"
            if gid in seen:
                continue
            seen.add(gid)
            x, z = frame.to_local(g[:, 0], g[:, 1])
            if math.hypot(x.mean(), z.mean()) > r_units:
                continue
            h = g[:, 2]
            top = h.max()
            height = float(top - h.min())
            if height < 1:
                continue
            # 同じ点を 1 つにまとめてから、屋根の面の外周をとる
            key = np.round(np.stack([x, z], 1), 2)
            uniq, inv = np.unique(key, axis=0, return_inverse=True)
            inv = inv.ravel()
            roof = [tuple(inv[t]) for t in tris if (h[t] > top - 0.05).all()]
            if not roof:
                continue
            ring = ring_of(roof, [tuple(p) for p in uniq])
            far = max(range(len(ring)), key=lambda i: math.dist(ring[0], ring[i]))
            ring = simplify(ring[: far + 1], 0.15)[:-1] + simplify(ring[far:] + [ring[0]], 0.15)[:-1]
            if len(ring) < 3 or abs(area(ring)) * M_PER_UNIT ** 2 < 6:
                continue
            if area(ring) < 0:
                ring = ring[::-1]
            out.append({"h": round(height, 1), "ring": [[round(a, 2), round(b, 2)] for a, b in ring], "src": "plateau"})
    return out


# PLATEAU 土地利用の層の番号（class_2xx）を、地面の塗り分けにまとめる
LUSE = {201: "paddy", 202: "field", 203: "forest", 204: "water", 205: "wild", 211: "home", 212: "shop", 213: "work",
        214: "public", 215: "road", 216: "rail", 217: "park", 223: "open"}
CIRCLE = 48  # 町の外周を何角形で切るか


def clip(ring, r):
    """多角形を半径 r の円（の内接多角形）で切る。Sutherland–Hodgman"""
    edge = [(r * math.cos(2 * math.pi * i / CIRCLE), r * math.sin(2 * math.pi * i / CIRCLE)) for i in range(CIRCLE)]
    out = ring
    for i in range(CIRCLE):
        if not out:
            break
        a, b = edge[i], edge[(i + 1) % CIRCLE]
        inside = lambda p: (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
        src, out = out, []
        for j, cur in enumerate(src):
            prev = src[j - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur, a, b))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur, a, b))
    return out


def cross(p, q, a, b):
    x1, y1, x2, y2 = p[0], p[1], q[0], q[1]
    x3, y3, x4, y4 = a[0], a[1], b[0], b[1]
    d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def plateau_areas(frame, r_units):
    """道路の面と土地利用の面。MVT のズーム 15 から、町の円にかかるタイルだけ読む"""
    lat0, lon0 = frame.lat, frame.lon
    x0, y0 = plateau.lonlat_tile(lat0 + 0.01, lon0 - 0.01, 15)
    x1, y1 = plateau.lonlat_tile(lat0 - 0.01, lon0 + 0.01, 15)
    roads, land = [], []
    layers = (("03_road/31201_tottori-shi_2020_tran", roads), ("07_landuse/31201_tottori-shi_2020_luse", land))
    names = set(plateau.archive().namelist())
    for d, bucket in layers:
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                path = plateau.PRE + d + f"/15/{x}/{y}.mvt"
                if path not in names:
                    continue
                for name, _, rings in plateau.read_mvt(path, 15, x, y):
                    kind = "road" if name == "road" else LUSE.get(int(name.split("_")[-1]), "open")
                    for ring in rings:
                        pts = [frame.to_local(lat, lon) for lat, lon in ring]
                        c = clip(pts, r_units)
                        if len(c) >= 3 and abs(area(c)) > 0.5:
                            bucket.append({"k": kind, "ring": [[round(a, 2), round(b, 2)] for a, b in c]})
    return roads, land


def plateau_rail(frame, r_units):
    """鉄道の中心線（PLATEAU の railway.json）。町の円の中の部分だけ"""
    out = []
    for f in plateau.read_json("04_railway/31201_tottori-shi_2020_railway.json")["features"]:
        g = f["geometry"]
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for line in lines:
            cur = []
            for lon, lat in line:
                x, z = frame.to_local(lat, lon)
                if math.hypot(x, z) <= r_units:
                    cur.append([round(x, 2), round(z, 2)])
                elif cur:
                    out.append(cur)
                    cur = []
            if len(cur) > 1:
                out.append(cur)
    return out


def gsi_parts(frame, r_units):
    """地理院のベクトルタイル（ズーム 16）から、建物・道路の面・水面・鉄道の線。タイルの縁で重なる分は、重心が自分のタイルにあるものだけ残す"""
    buildings, roads, water, rail = [], [], [], []
    for f in sorted(GSI_VT.glob("16_*.pbf")):
        z, x, y = map(int, f.stem.split("_"))
        n = 2 ** z
        west, east = x / n * 360 - 180, (x + 1) / n * 360 - 180
        north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
        south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
        cx, cz = frame.to_local((north + south) / 2, (west + east) / 2)
        if math.hypot(cx, cz) > r_units + 400:
            continue
        own = lambda pts: south <= sum(p[0] for p in pts) / len(pts) < north and west <= sum(p[1] for p in pts) / len(pts) < east
        for name, props, parts in plateau.decode_mvt(f.read_bytes(), z, x, y, kinds=(2, 3)):
            if name == "BldA":
                for ring in parts:
                    if not own(ring):
                        continue
                    pts = [frame.to_local(lat, lon) for lat, lon in ring]
                    if math.hypot(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)) > r_units:
                        continue
                    if len(pts) > 3 and math.dist(pts[0], pts[-1]) < 1e-6:
                        pts = pts[:-1]
                    if len(pts) < 3 or abs(area(pts)) * M_PER_UNIT ** 2 < 6:
                        continue
                    if area(pts) < 0:
                        pts = pts[::-1]
                    h = GSI_HEIGHT.get(props.get("vt_code"), 6.0)
                    h += (int(abs(pts[0][0]) * 7 + abs(pts[0][1]) * 13) % 3) * 0.8 if h == 6.0 else 0  # 同じ高さが並ばないよう少しずらす
                    buildings.append({"h": round(h, 1), "ring": [[round(a, 2), round(b, 2)] for a, b in pts], "src": "gsi"})
            elif name == "WA":
                for ring in parts:
                    c = clip([frame.to_local(lat, lon) for lat, lon in ring], r_units)
                    if len(c) >= 3 and abs(area(c)) > 0.5:
                        water.append({"k": "water", "ring": [[round(a, 2), round(b, 2)] for a, b in c]})
            elif name == "RdCL":
                w = GSI_ROAD_W.get(props.get("vt_rnkwidth"), 3.0) / M_PER_UNIT
                for line in parts:
                    roads += road_quads([frame.to_local(lat, lon) for lat, lon in line], w, r_units)
            elif name == "RailCL":
                for line in parts:
                    pts = [[round(a, 2), round(b, 2)] for a, b in (frame.to_local(lat, lon) for lat, lon in line) if math.hypot(a, b) <= r_units]
                    if len(pts) > 1:
                        rail.append(pts)
    return buildings, roads, water, rail


def road_quads(line, w, r_units):
    """道路の中心線を、幅 w（単位）の四角の並びにする。曲がり角のすき間は、角に置いた八角形でふさぐ"""
    out = []
    for a, b in zip(line, line[1:]):
        d = math.dist(a, b)
        if d < 1e-6 or (math.hypot(*a) > r_units and math.hypot(*b) > r_units):
            continue
        nx, nz = -(b[1] - a[1]) / d * w / 2, (b[0] - a[0]) / d * w / 2
        quad = [(a[0] + nx, a[1] + nz), (b[0] + nx, b[1] + nz), (b[0] - nx, b[1] - nz), (a[0] - nx, a[1] - nz)]
        out.append(quad)
    for p in line[1:-1]:
        if math.hypot(*p) <= r_units:
            out.append([(p[0] + w / 2 * math.cos(math.pi * i / 4), p[1] + w / 2 * math.sin(math.pi * i / 4)) for i in range(8)])
    rings = []
    for q in out:
        c = clip(q, r_units)
        if len(c) >= 3:
            if area(c) < 0:
                c = c[::-1]
            rings.append({"k": "road", "ring": [[round(a, 2), round(b, 2)] for a, b in c]})
    return rings


def dem_height(lat, lon, cache={}):
    """国土地理院 dem_png z14 の標高（m）。海や取れていない所は 0"""
    z = 14
    n = 2 ** z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    tx, ty = int(fx), int(fy)
    key = (tx, ty)
    if key not in cache:
        path = DEM / f"{z}_{tx}_{ty}.png"
        cache[key] = np.asarray(Image.open(path).convert("RGB"), dtype=np.int64) if path.exists() else None
    img = cache[key]
    if img is None:
        return 0.0
    r, g, b = img[min(int((fy - ty) * 256), 255), min(int((fx - tx) * 256), 255)]
    v = (r << 16) + (g << 8) + b
    if v == 2 ** 23:
        return 0.0
    return (v - 2 ** 24 if v > 2 ** 23 else v) * 0.01


def ground(frame, r_units):
    """町の中心を 0 にした地面の高さ（m）の格子"""
    half = r_units + GROUND_EXTRA
    count = int(2 * half / GROUND_CELL) + 1
    half = (count - 1) * GROUND_CELL / 2
    base = dem_height(frame.lat, frame.lon)
    h = []
    for r in range(count):
        z = -half + r * GROUND_CELL
        lat = frame.lat - z / frame.kz
        for q in range(count):
            x = -half + q * GROUND_CELL
            h.append(round(dem_height(lat, frame.lon + x / frame.kx) - base, 1))
    return {"cell": GROUND_CELL, "n": count, "h": h, "base_m": round(base, 1)}


def preview(pid, town, path):
    s = 1.0
    r = R_BLDG / M_PER_UNIT
    img = Image.new("RGB", (int(2 * r * s), int(2 * r * s)), (235, 232, 220))
    d = ImageDraw.Draw(img)
    col = {"paddy": (200, 215, 140), "field": (215, 200, 150), "forest": (90, 140, 80), "water": (110, 170, 220), "park": (150, 200, 130), "wild": (170, 190, 140)}
    for a in town["land"]:
        if a["k"] in col:
            d.polygon([((x + r) * s, (z + r) * s) for x, z in a["ring"]], fill=col[a["k"]])
    for a in town["roads"]:
        d.polygon([((x + r) * s, (z + r) * s) for x, z in a["ring"]], fill=(160, 160, 165))
    for line in town["rail"]:
        d.line([((x + r) * s, (z + r) * s) for x, z in line], fill=(40, 40, 40), width=3)
    for b in town["buildings"]:
        d.polygon([((x + r) * s, (z + r) * s) for x, z in b["ring"]], fill=(150, 90, 70) if b["h"] < 10 else (90, 100, 130))
    d.ellipse([r - 4, r - 4, r + 4, r + 4], fill=(255, 0, 0))
    img.save(path)


def write_origins(world):
    """市の地図の座標で、実在の町の中心（center、無ければ geo）を places[].origin に、町名の代表点 geo を geo_at に書く。
    画面の cityAt と、市の地図に残した物の置き場所が使う"""
    o = json.loads((ROOT / "public" / "city" / "city.json").read_text(encoding="utf-8"))["origin"]
    kx = 111320 * math.cos(math.radians(o["lat"])) / o["m_per_unit"]
    kz = 110950 / o["m_per_unit"]
    unit = lambda lat, lon: [round((lon - o["lon"]) * kx, 2), round(-(lat - o["lat"]) * kz, 2)]
    for p in world["places"]:
        p["origin"] = unit(*(p.get("center") or p["geo"]))
        p["geo_at"] = unit(*p["geo"])
    with open(ROOT / "data" / "world.json", "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(world, ensure_ascii=False, indent=2) + "\n")


def main():
    world = json.loads((ROOT / "data" / "world.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    write_origins(world)
    for p in world["places"]:
        if only and p["id"] not in only:
            continue
        frame = Frame(*(p.get("center") or p["geo"]))
        r_units = R_BLDG / M_PER_UNIT
        if p["id"] in GSI_TOWNS:
            buildings, roads, water, rail = gsi_parts(frame, r_units)
            _, land = plateau_areas(frame, r_units)
            land = [a for a in land if a["k"] not in ("road", "water")] + water
        else:
            buildings = plateau_buildings(frame, r_units)
            roads, land = plateau_areas(frame, r_units)
            rail = plateau_rail(frame, r_units)
        town = {"m_per_unit": M_PER_UNIT, "radius": round(r_units, 1), "ground": ground(frame, r_units), "buildings": buildings, "roads": roads, "land": land, "rail": rail}
        (OUT / f"{p['id']}.json").write_text(json.dumps(town, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(p["id"], "buildings", len(buildings), "roads", len(roads), "land", len(land), "rail", len(town["rail"]), "bytes", (OUT / f"{p['id']}.json").stat().st_size)
        preview(p["id"], town, ROOT / "data" / "build" / f"town_{p['id']}.png")


if __name__ == "__main__":
    main()
