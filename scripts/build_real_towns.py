"""9 つの町の中を、実在の建物・道・川・鉄道の形と位置で組む。LLM は使わない。

入力: PLATEAU 鳥取市 2020（scripts/plateau.py）。OSM（data/raw/osm/<町>.json）があれば、PLATEAU の無い所を OSM で補う。
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


def main():
    world = json.loads((ROOT / "data" / "world.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for p in world["places"]:
        if only and p["id"] not in only:
            continue
        frame = Frame(*p["geo"])
        r_units = R_BLDG / M_PER_UNIT
        buildings = plateau_buildings(frame, r_units)
        roads, land = plateau_areas(frame, r_units)
        town = {"m_per_unit": M_PER_UNIT, "radius": round(r_units, 1), "ground": ground(frame, r_units), "buildings": buildings, "roads": roads, "land": land, "rail": plateau_rail(frame, r_units)}
        (OUT / f"{p['id']}.json").write_text(json.dumps(town, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(p["id"], "buildings", len(buildings), "roads", len(roads), "land", len(land), "rail", len(town["rail"]), "bytes", (OUT / f"{p['id']}.json").stat().st_size)
        preview(p["id"], town, ROOT / "data" / "build" / f"town_{p['id']}.png")


if __name__ == "__main__":
    main()
