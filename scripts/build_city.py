"""鳥取市全域の地形と配置を、取得済みの公式データから作る。LLM は使わない。

入力（data/raw/。取得は scripts/fetch.sh と scripts/fetch_dem.py）
  dem/     国土地理院 標高タイル dem_png（DEM10B）z11
  n03/     国土数値情報 行政区域データ 2025 鳥取県
  gtfs1/ gtfs2/  日本交通・日ノ丸自動車の GTFS-JP
  population_2026-09.xlsx  鳥取市 町別人口 ／ isj/  位置参照情報 大字・町丁目
出力
  data/build/city.npz, data/build/city_lines.json  Blender（scripts/blender/city.py）に渡す
  public/city/city.json  実行時の配置（木・家・地名・バスの経路）
  public/city/mask.bin   格子点ごとの印 1 バイト（1 歩ける / 2 市内 / 4 水）
  public/city/map.png    小さな地図の下絵
  data/world.json        places[].at を緯度経度から求めて書き戻す
座標は鳥取駅が原点、1 単位 = 50 m、+x が東、+z が南。
家と木の位置は人口と標高から作った見た目で、実在の建物の位置ではない。
"""
import csv
import heapq
import json
import math
import pathlib
import random
from collections import defaultdict

import numpy as np
import openpyxl
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"
PUB = ROOT / "public" / "city"

M_PER_UNIT = 50
CELL = 2  # 格子の間隔（単位）= 100 m
EXAG = 1.5  # 高さの強調。見た目で決めた値
Y_PER_M = EXAG / M_PER_UNIT
LAND_LIFT = 0.25  # 陸を水面より少し上げる
SEA_FLOOR = -1.5
LAKE_FLOOR = -0.6
ORIGIN = (35.4949, 134.2249)  # GTFS の停留所「鳥取駅」7 か所のおよその平均
KX = 111320 * math.cos(math.radians(ORIGIN[0])) / M_PER_UNIT
KZ = 110950 / M_PER_UNIT
BBOX = (133.935, 35.262, 134.452, 35.582)  # 鳥取市の外枠（N03）に約 1 km の余白
DEM_Z = 11
RIVER_CELLS = 300  # 集水域 3 km² 以上を川として描く
PEOPLE_PER_HOUSE = 250  # 見た目の密度。1 軒 = 250 人
PLACE_CLEAR = 12  # 場所の周りは家と木を置かない（単位）

rng = random.Random(7)


def to_unit(lat, lon):
    return (lon - ORIGIN[1]) * KX, -(lat - ORIGIN[0]) * KZ


def to_geo(x, z):
    return ORIGIN[0] - z / KZ, ORIGIN[1] + x / KX


# ---------- 格子 ----------
_nx, _nz = to_unit(BBOX[3], BBOX[0])
_sx, _sz = to_unit(BBOX[1], BBOX[2])
X0 = math.floor(_nx / CELL) * CELL
Z0 = math.floor(_nz / CELL) * CELL
W = int(math.ceil((_sx - X0) / CELL)) + 1
H = int(math.ceil((_sz - Z0) / CELL)) + 1
GX, GZ = np.meshgrid(X0 + np.arange(W) * CELL, Z0 + np.arange(H) * CELL)
LAT, LON = to_geo(GX, GZ)


def cell_of(x, z):
    return int(round((z - Z0) / CELL)), int(round((x - X0) / CELL))


def inside(r, q):
    return 0 <= r < H and 0 <= q < W


def grow(mask, times):
    for _ in range(times):
        mask = mask | np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)
    return mask


# ---------- 標高 ----------
def load_dem():
    tiles = sorted((RAW / "dem").glob(f"{DEM_Z}_*.png"))
    keys = [tuple(int(v) for v in t.stem.split("_")[1:]) for t in tiles]
    tx0, ty0 = min(k[0] for k in keys), min(k[1] for k in keys)
    nx, ny = max(k[0] for k in keys) - tx0 + 1, max(k[1] for k in keys) - ty0 + 1
    dem = np.full((ny * 256, nx * 256), np.nan)
    for t, (x, y) in zip(tiles, keys):
        a = np.asarray(Image.open(t).convert("RGB")).astype(np.int64)
        v = (a[..., 0] << 16) + (a[..., 1] << 8) + a[..., 2]
        h = np.where(v < 2**23, v * 0.01, (v - 2**24) * 0.01)  # 仕様の式。無効値は次の行で消す
        h[v == 2**23] = np.nan
        dem[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = h
    return dem, tx0 * 256, ty0 * 256


def sample_dem(dem, px0, py0):
    n = 2**DEM_Z * 256
    fx = (LON + 180) / 360 * n - px0 - 0.5
    fy = (1 - np.arcsinh(np.tan(np.radians(LAT))) / math.pi) / 2 * n - py0 - 0.5
    i, j = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - i, fy - j
    num = np.zeros_like(fx)
    den = np.zeros_like(fx)
    for dj, di, w in ((0, 0, (1 - tx) * (1 - ty)), (0, 1, tx * (1 - ty)), (1, 0, (1 - tx) * ty), (1, 1, tx * ty)):
        v = dem[j + dj, i + di]
        ok = ~np.isnan(v)
        num += np.where(ok, v, 0) * w
        den += np.where(ok, w, 0)
    return np.where(den > 0.5, num / np.maximum(den, 1e-9), np.nan)  # 半分以上が海なら海


# ---------- 市の形 ----------
def city_mask():
    g = json.loads((RAW / "n03" / "N03-20250101_31.geojson").read_text(encoding="utf-8"))
    img = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(img)
    for f in g["features"]:
        if f["properties"]["N03_004"] != "鳥取市":
            continue
        pts = []
        for lon, lat in f["geometry"]["coordinates"][0]:
            x, z = to_unit(lat, lon)
            pts.append(((x - X0) / CELL, (z - Z0) / CELL))
        draw.polygon(pts, fill=1)
    return np.asarray(img).astype(bool)


def components(mask):
    seen = np.zeros_like(mask)
    out = []
    for r0, q0 in zip(*np.nonzero(mask)):
        if seen[r0, q0]:
            continue
        stack, comp = [(r0, q0)], []
        seen[r0, q0] = True
        while stack:
            r, q = stack.pop()
            comp.append((r, q))
            for rr, qq in ((r + 1, q), (r - 1, q), (r, q + 1), (r, q - 1)):
                if inside(rr, qq) and mask[rr, qq] and not seen[rr, qq]:
                    seen[rr, qq] = True
                    stack.append((rr, qq))
        out.append(comp)
    return out


# ---------- 川（窪地を埋めて、流れる先をたどる） ----------
def rivers(y, land):
    flat = y.ravel()
    landf = land.ravel()
    recv = np.full(H * W, -1)
    done = ~landf.copy()
    heap = []
    wet = grow(~land, 1) & land
    for c in np.flatnonzero(landf):
        r, q = divmod(c, W)
        if r in (0, H - 1) or q in (0, W - 1) or wet[r, q]:
            heapq.heappush(heap, (flat[c], c))
            done[c] = True
    order = []
    while heap:
        e, c = heapq.heappop(heap)
        order.append(c)
        r, q = divmod(c, W)
        for dr in (-1, 0, 1):
            for dq in (-1, 0, 1):
                rr, qq = r + dr, q + dq
                if not inside(rr, qq):
                    continue
                n = rr * W + qq
                if done[n]:
                    continue
                done[n] = True
                recv[n] = c
                heapq.heappush(heap, (max(flat[n], e + 1e-5), n))
    acc = landf.astype(np.float64)
    for c in reversed(order):
        if recv[c] >= 0:
            acc[recv[c]] += acc[c]
    river = (acc >= RIVER_CELLS) & landf
    ups = np.zeros(H * W, int)
    for c in np.flatnonzero(river):
        if recv[c] >= 0:
            ups[recv[c]] += 1
    lines, visited = [], np.zeros(H * W, bool)
    for s in np.flatnonzero(river & (ups == 0)):
        pts, c = [], s
        while True:
            r, q = divmod(c, W)
            pts.append((X0 + q * CELL, Z0 + r * CELL, acc[c]))
            if visited[c]:
                break
            visited[c] = True
            nxt = recv[c]
            if nxt < 0:
                break
            if not landf[nxt]:
                r2, q2 = divmod(nxt, W)
                pts.append((X0 + q2 * CELL, Z0 + r2 * CELL, acc[c]))
                break
            c = nxt
        if len(pts) >= 3:
            lines.append(smooth([(x, z, river_width(a)) for x, z, a in pts]))
    return lines


def river_width(acc):
    return min(3.6, 0.6 + 0.55 * math.log2(max(acc, RIVER_CELLS) / RIVER_CELLS))


def smooth(pts, times=2):
    for _ in range(times):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out.append(tuple(0.75 * u + 0.25 * v for u, v in zip(a, b)))
            out.append(tuple(0.25 * u + 0.75 * v for u, v in zip(a, b)))
        out.append(pts[-1])
        pts = out
    return [[round(float(v), 2) for v in p] for p in pts]


# ---------- バス路線（停留所を順に結んだ線） ----------
def bus_graph():
    nodes, node_of, edges = [], {}, defaultdict(dict)
    by_name = defaultdict(list)
    for feed in ("gtfs1", "gtfs2"):
        for r in csv.DictReader(open(RAW / feed / "stops.txt", encoding="utf-8-sig")):
            lat, lon = float(r["stop_lat"]), float(r["stop_lon"])
            if not (BBOX[0] < lon < BBOX[2] and BBOX[1] < lat < BBOX[3]):
                continue
            x, z = to_unit(lat, lon)
            group = by_name[r["stop_name"]]
            hit = next((n for n in group if math.dist(nodes[n][:2], (x, z)) < 8), None)  # 同じ名前で 400 m 以内は1つにまとめる
            if hit is None:
                hit = len(nodes)
                nodes.append((x, z, r["stop_name"]))
                group.append(hit)
            node_of[(feed, r["stop_id"])] = hit
        trips = defaultdict(list)
        for r in csv.DictReader(open(RAW / feed / "stop_times.txt", encoding="utf-8-sig")):
            trips[r["trip_id"]].append((int(r["stop_sequence"]), r["stop_id"]))
        for seq in trips.values():
            seq.sort()
            for (_, a), (_, b) in zip(seq, seq[1:]):
                na, nb = node_of.get((feed, a)), node_of.get((feed, b))
                if na is None or nb is None or na == nb:
                    continue
                d = math.dist(nodes[na][:2], nodes[nb][:2])
                edges[na][nb] = edges[nb][na] = d
    return nodes, edges


def shortest(edges, src):
    dist, prev, heap = {src: 0.0}, {}, [(0.0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in edges[u].items():
            if d + w < dist.get(v, 1e18):
                dist[v], prev[v] = d + w, u
                heapq.heappush(heap, (d + w, v))
    return dist, prev


# ---------- 人口と町丁目の代表点 ----------
def towns():
    wb = openpyxl.load_workbook(RAW / "population_2026-09.xlsx", read_only=True, data_only=True)
    rows = list(wb[wb.sheetnames[0]].iter_rows(values_only=True))
    pop = {}
    for i, row in enumerate(rows):
        name = row[1]
        if not isinstance(name, str) or not name.strip() or name.strip() == "町名" or i + 2 >= len(rows):
            continue
        total = rows[i + 2][3]  # 町ごとに 男・女・計 の3行。計の行の人口
        if isinstance(total, (int, float)) and total > 0:
            pop[name.strip()] = int(total)
    isj_csv = next((RAW / "isj").glob("*/31_2025.csv"))
    points = {}
    for r in csv.DictReader(open(isj_csv, encoding="cp932")):
        if r["市区町村名"] == "鳥取市":
            points[r["大字町丁目名"]] = (float(r["緯度"]), float(r["経度"]))
    return pop, points


class Occupancy:
    """道・川・家・場所が使っている所。1 単位の細かい格子"""

    def __init__(self):
        self.a = np.zeros((H * CELL, W * CELL), bool)

    def _box(self, x, z, rad):
        r0, q0, k = int(z - Z0), int(x - X0), int(round(rad))
        return r0 - k, r0 + k + 1, q0 - k, q0 + k + 1

    def mark(self, x, z, rad):
        r1, r2, q1, q2 = self._box(x, z, rad)
        self.a[max(0, r1):r2, max(0, q1):q2] = True

    def free(self, x, z, rad):
        r1, r2, q1, q2 = self._box(x, z, rad)
        if r1 < 0 or q1 < 0 or r2 > self.a.shape[0] or q2 > self.a.shape[1]:
            return False
        return not self.a[r1:r2, q1:q2].any()


def flat_spot(p, walk, slope):
    x, z = to_unit(*p["geo"])
    best = None
    for dz in range(-10, 11, 2):
        for dx in range(-10, 11, 2):
            r, q = cell_of(x + dx, z + dz)
            if not inside(r, q) or not walk[max(0, r - 4):r + 5, max(0, q - 4):q + 5].all():
                continue
            score = slope[max(0, r - 4):r + 5, max(0, q - 4):q + 5].mean() * 40 + math.hypot(dx, dz) * 0.05
            if best is None or score < best[0]:
                best = (score, x + dx, z + dz)
    if best is None:
        raise SystemExit(f"平らな所が見つからない: {p['id']}")
    return [round(best[1], 1), round(best[2], 1)]


def bus_routes(world, nodes, edges):
    hubs = [p for p in world["places"] if p.get("hub")]
    hub_node = {p["id"]: min(range(len(nodes)), key=lambda n: math.dist(nodes[n][:2], p["at"])) for p in hubs}
    routes = {}
    for a in hubs:
        dist, prev = shortest(edges, hub_node[a["id"]])
        for b in hubs:
            if a["id"] >= b["id"]:
                continue
            t = hub_node[b["id"]]
            if t not in dist:
                print("バスでつながっていない:", a["id"], b["id"])
                continue
            path, c = [], t
            while c != hub_node[a["id"]]:
                path.append(nodes[c][:2])
                c = prev[c]
            path.append(nodes[c][:2])
            path.reverse()
            pts = [a["at"]] + [list(v) for v in path] + [b["at"]]
            km = sum(math.dist(u, v) for u, v in zip(pts, pts[1:])) * M_PER_UNIT / 1000
            routes[f"{a['id']}|{b['id']}"] = {"km": round(km, 1), "path": [[round(v, 1) for v in pt] for pt in pts]}
    return routes


def place_houses(walk, slope, occ):
    pop, points = towns()
    houses, matched = [], 0
    for name, n_people in pop.items():
        if name not in points:
            continue
        matched += n_people
        cx, cz = to_unit(*points[name])
        n = int(n_people / PEOPLE_PER_HOUSE + rng.random())
        rad = 3 + 1.9 * math.sqrt(n)
        for _ in range(n):
            for _try in range(24):
                a, d = rng.random() * math.tau, rad * math.sqrt(rng.random())
                x, z = cx + math.cos(a) * d, cz + math.sin(a) * d
                r, q = cell_of(x, z)
                if not inside(r, q) or not walk[r, q] or slope[r, q] > 0.22 or not occ.free(x, z, 1.2):
                    continue
                occ.mark(x, z, 1.2)
                houses.append([round(x, 1), round(z, 1), rng.randrange(4), rng.randrange(4)])
                break
    print(f"houses {len(houses)}  people matched {matched}/{sum(pop.values())}")
    return houses, points


def place_trees(land, hm, slope, city, near_sea, occ):
    trees = []
    for z in np.arange(Z0 + 2, Z0 + (H - 1) * CELL, 3.2):
        for x in np.arange(X0 + 2, X0 + (W - 1) * CELL, 3.2):
            x2, z2 = x + rng.uniform(-1.4, 1.4), z + rng.uniform(-1.4, 1.4)
            r, q = cell_of(x2, z2)
            if not inside(r, q) or not land[r, q]:
                continue
            m = hm[r, q]
            coast = near_sea[r, q] and m < 40
            p = 0.45 if coast else 0.01 if m < 15 else 0.12 if m < 60 else 0.34 if m < 900 else 0.22
            if slope[r, q] > 1.2 or rng.random() > p or not occ.free(x2, z2, 0.6):
                continue
            broad = m < 80 and not coast and rng.random() < 0.6
            kind = (1 if broad else 0) + (0 if city[r, q] else 2)  # 0 針葉樹 1 広葉樹、市の外は +2
            trees.append([round(x2, 1), round(z2, 1), round(rng.uniform(0.75, 1.35), 2), kind])
    print(f"trees {len(trees)}")
    return trees


def colors(hm, land, sea, water, slope, city, near_sea):
    bands = [(-1e9, (0.66, 0.83, 0.45)), (40, (0.55, 0.76, 0.38)), (150, (0.40, 0.63, 0.32)),
             (450, (0.31, 0.53, 0.29)), (800, (0.27, 0.46, 0.28)), (1100, (0.52, 0.55, 0.42))]
    col = np.zeros((H, W, 3), np.float32)
    for lo, c in bands:
        col[hm >= lo] = c
    dune = (LAT > 35.528) & (LAT < 35.552) & (LON > 134.215) & (LON < 134.275) & (hm < 70) & land
    col[(near_sea & (hm < 12)) | dune] = (0.93, 0.85, 0.62)
    col[sea | water] = (0.36, 0.55, 0.68)
    col *= (1 + (np.random.default_rng(3).random((H, W, 1)) - 0.5) * 0.08).astype(np.float32)
    col[slope > 0.9] *= 0.85
    out = ~city & land
    col[out] = col[out] * 0.45 + np.array((0.93, 0.91, 0.84), np.float32) * 0.55
    return np.clip(col, 0, 1)


def draw_map(col, sea, water, river_lines, road_lines):
    mp = (col * 255).astype(np.uint8)
    mp[sea | water] = (111, 177, 212)
    img = Image.fromarray(mp, "RGB")
    d = ImageDraw.Draw(img)
    for line in river_lines:
        d.line([((x - X0) / CELL, (z - Z0) / CELL) for x, z, _ in line], fill=(111, 177, 212), width=1)
    for (xa, za), (xb, zb) in road_lines:
        d.line([((xa - X0) / CELL, (za - Z0) / CELL), ((xb - X0) / CELL, (zb - Z0) / CELL)], fill=(255, 250, 235), width=1)
    img.save(PUB / "map.png", optimize=True)


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    PUB.mkdir(parents=True, exist_ok=True)
    dem, px0, py0 = load_dem()
    h = sample_dem(dem, px0, py0)
    sea = np.isnan(h)
    city = city_mask()
    water = np.zeros_like(sea)
    lakes = []
    for comp in components((~sea) & (h <= 0.0)):  # 標高 0 の陸は湖や河口の水面
        if len(comp) < 4:
            continue
        rs, qs = zip(*comp)
        water[rs, qs] = True
        lakes.append((len(comp), float(np.mean(qs)) * CELL + X0, float(np.mean(rs)) * CELL + Z0))
    lakes.sort(reverse=True)
    land = ~sea & ~water
    hm = np.where(land, h, 0)
    y = np.where(sea, SEA_FLOOR, np.where(water, LAKE_FLOOR, LAND_LIFT + np.maximum(hm, 0) * Y_PER_M))
    gz, gx = np.gradient(y, CELL)
    slope = np.hypot(gx, gz)
    walk = city & land
    near_sea = grow(sea, 3) & land
    print(f"grid {W}x{H}  land {land.mean():.2f} city {city.mean():.2f} lakes {[(n, round(x), round(z)) for n, x, z in lakes[:4]]}")

    river_lines = rivers(y, land)
    nodes, edges = bus_graph()
    roads = sorted({(min(a, b), max(a, b)) for a in edges for b in edges[a]})
    road_lines = [[list(nodes[a][:2]), list(nodes[b][:2])] for a, b in roads]
    print(f"rivers {len(river_lines)}  bus stops {len(nodes)}  road segments {len(roads)}")

    occ = Occupancy()
    for (xa, za), (xb, zb) in road_lines:
        n = max(1, int(math.dist((xa, za), (xb, zb)) / 0.7))
        for t in range(n + 1):
            occ.mark(xa + (xb - xa) * t / n, za + (zb - za) * t / n, 1)
    for line in river_lines:
        for x, z, w in line:
            occ.mark(x, z, w / 2 + 0.5)

    world_path = ROOT / "data" / "world.json"
    world = json.loads(world_path.read_text(encoding="utf-8"))
    for p in world["places"]:
        p["at"] = flat_spot(p, walk, slope)
        occ.mark(p["at"][0], p["at"][1], PLACE_CLEAR)
    world_path.write_text(json.dumps(world, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    routes = bus_routes(world, nodes, edges)
    houses, points = place_houses(walk, slope, occ)
    trees = place_trees(land, hm, slope, city, near_sea, occ)

    label_src = {
        "用瀬": "用瀬町用瀬", "河原": "河原町河原", "国府": "国府町宮下", "福部": "福部町細川", "気高": "気高町浜村",
        "鹿野": "鹿野町鹿野", "青谷": "青谷町青谷", "賀露": "賀露町", "湖山": "湖山町東一丁目", "雲山": "雲山",
        "若葉台": "若葉台南一丁目", "佐治": "佐治町加瀬木",
    }
    labels = [{"name": k, "at": [round(v, 1) for v in to_unit(*points[s])], "kind": "town"} for k, s in label_src.items()]
    labels.append({"name": "鳥取駅", "at": [0, 0], "kind": "town"})
    labels.append({"name": "鳥取砂丘", "at": [round(v, 1) for v in to_unit(35.5413, 134.2386)], "kind": "sight"})  # GTFS「砂丘センター展望台」
    if lakes:
        labels.append({"name": "湖山池", "at": [round(lakes[0][1], 1), round(lakes[0][2], 1)], "kind": "water"})

    col = colors(hm, land, sea, water, slope, city, near_sea)
    keep = grow(land, 3)  # 遠い海の底は描かない
    np.savez_compressed(BUILD / "city.npz", y=y.astype(np.float32), col=col, keep=keep,
                        grid=np.array([X0, Z0, CELL, W, H], np.float64))
    (BUILD / "city_lines.json").write_text(json.dumps({"rivers": river_lines, "roads": road_lines}), encoding="utf-8")
    mask = (walk * 1 + city * 2 + (sea | water) * 4).astype(np.uint8)
    (PUB / "mask.bin").write_bytes(mask.tobytes())
    draw_map(col, sea, water, river_lines, road_lines)

    city_json = {
        "note": "鳥取市全域。地形は国土地理院の標高タイル、市の形は国土数値情報、道はバス停留所を順に結んだ線。家と木は人口と標高から置いた見た目で、実在の建物の位置ではない",
        "grid": {"x0": X0, "z0": Z0, "cell": CELL, "w": W, "h": H},
        "origin": {"lat": ORIGIN[0], "lon": ORIGIN[1], "m_per_unit": M_PER_UNIT, "exaggeration": EXAG},
        "houses": houses,
        "trees": trees,
        "labels": labels,
        "routes": routes,
    }
    (PUB / "city.json").write_text(json.dumps(city_json, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("routes", len(routes), "city.json bytes", (PUB / "city.json").stat().st_size)


if __name__ == "__main__":
    main()
