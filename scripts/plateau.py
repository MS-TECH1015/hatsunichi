"""PLATEAU 鳥取市 2020 の 3D Tiles・MVT・GeoJSON を読む道具。scripts/build_real_towns.py から使う。

入力は data/raw/plateau/31201_2020_3Dtiles_etc_1_op.zip（取得は 2026-11-07、data/SOURCES.md の plateau_2020）。
建物は b3dm（CESIUM_RTC、圧縮なし）。1 タイルに建物が数百。頂点は地心直交座標で、RTC の中心からの差。
"""
import json
import math
import struct
import zipfile
from functools import lru_cache

import numpy as np

ZIP = "data/raw/plateau/31201_2020_3Dtiles_etc_1_op.zip"
PRE = "31201_tottori-shi_2020_3Dtiles_etc_1_op/"
BLDG = PRE + "01_building/31201_tottori-shi_2020_bldg_notexture/"

A = 6378137.0
F = 1 / 298.257223563
E2 = F * (2 - F)


def ecef_to_geo(x, y, z):
    """地心直交座標から緯度・経度（度）と楕円体高（m）。Bowring の式"""
    b = A * (1 - F)
    ep2 = (A * A - b * b) / (b * b)
    p = np.hypot(x, y)
    th = np.arctan2(z * A, p * b)
    lat = np.arctan2(z + ep2 * b * np.sin(th) ** 3, p - E2 * A * np.cos(th) ** 3)
    lon = np.arctan2(y, x)
    n = A / np.sqrt(1 - E2 * np.sin(lat) ** 2)
    h = p / np.cos(lat) - n
    return np.degrees(lat), np.degrees(lon), h


@lru_cache(maxsize=1)
def archive():
    return zipfile.ZipFile(ZIP)


def tiles():
    """建物タイルの (uri, 西, 南, 東, 北)。度"""
    root = json.loads(archive().read(BLDG + "tileset.json"))["root"]
    out = []

    def walk(node):
        c = node.get("content")
        if c:
            w, s, e, n = (math.degrees(v) for v in (c.get("boundingVolume") or node["boundingVolume"])["region"][:4])
            out.append((c["uri"], w, s, e, n))
        for ch in node.get("children", []):
            walk(ch)

    walk(root)
    return out


def read_b3dm(uri):
    """建物ごとの三角形。{batch_id: (頂点 (n,3) の緯度・経度・楕円体高, 三角形 (m,3))} と属性表"""
    b = archive().read(BLDG + uri)
    _, _, _, ftj, ftb, btj, btb = struct.unpack("<4sIIIIII", b[:28])
    o = 28 + ftj + ftb
    table = json.loads(b[o:o + btj]) if btj else {}
    o += btj + btb
    glb = b[o:]
    n = struct.unpack("<I", glb[12:16])[0]
    g = json.loads(glb[20:20 + n])
    binstart = 20 + n + 8
    rtc = g.get("extensions", {}).get("CESIUM_RTC", {}).get("center", [0, 0, 0])

    def acc(i):
        a = g["accessors"][i]
        v = g["bufferViews"][a["bufferView"]]
        start = binstart + v.get("byteOffset", 0) + a.get("byteOffset", 0)
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a["componentType"]]
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        stride = v.get("byteStride")
        size = np.dtype(dt).itemsize * comps
        if stride and stride != size:
            raw = np.frombuffer(glb, np.uint8, a["count"] * stride, start).reshape(a["count"], stride)[:, :size]
            return raw.copy().view(dt).reshape(a["count"], comps)
        return np.frombuffer(glb, dt, a["count"] * comps, start).reshape(a["count"], comps) if comps > 1 else np.frombuffer(glb, dt, a["count"], start)

    out = {}
    for mesh in g["meshes"]:
        for prim in mesh["primitives"]:
            pos = acc(prim["attributes"]["POSITION"]).astype(np.float64)
            bid = acc(prim["attributes"]["_BATCHID"]).astype(np.int64).ravel()
            idx = acc(prim["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in prim else np.arange(len(pos)).reshape(-1, 3)
            # glTF は y が上。3D Tiles の z 上へ戻す（x, -z, y）
            ex, ey, ez = pos[:, 0] + rtc[0], -pos[:, 2] + rtc[1], pos[:, 1] + rtc[2]
            lat, lon, h = ecef_to_geo(ex, ey, ez)
            geo = np.stack([lat, lon, h], 1)
            tri_b = bid[idx[:, 0]]
            for k in np.unique(tri_b):
                t = idx[tri_b == k]
                used = np.unique(t)
                remap = {int(u): i for i, u in enumerate(used)}
                out[int(k)] = (geo[used], np.vectorize(remap.get)(t))
    return out, table


def column(table, name, count, raw_b3dm=None):
    v = table.get(name)
    return v if isinstance(v, list) else [None] * count


# ---------- MVT ----------
def mvt_tiles(layer_dir, z):
    """MVT のタイル番号の一覧"""
    names = [n for n in archive().namelist() if n.startswith(PRE + layer_dir) and n.endswith(".mvt") and f"/{z}/" in n]
    out = []
    for n in names:
        parts = n.split("/")
        out.append((int(parts[-2]), int(parts[-1][:-4]), n))
    return out


def read_json(path):
    return json.loads(archive().read(PRE + path))


def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def _fields(b):
    """protobuf の (番号, 型, 値) を順に返す。型 2 は bytes、0 は整数"""
    i = 0
    while i < len(b):
        key, i = _varint(b, i)
        f, t = key >> 3, key & 7
        if t == 0:
            v, i = _varint(b, i)
        elif t == 2:
            n, i = _varint(b, i)
            v, i = b[i:i + n], i + n
        elif t == 1:
            v, i = b[i:i + 8], i + 8
        elif t == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError(f"protobuf の型 {t}")
        yield f, t, v


def _packed(b):
    out, i = [], 0
    while i < len(b):
        v, i = _varint(b, i)
        out.append(v)
    return out


def _value(b):
    for f, t, v in _fields(b):
        if f == 1:
            return v.decode("utf-8")
        if f == 2:
            return struct.unpack("<f", v)[0]
        if f == 3:
            return struct.unpack("<d", v)[0]
        if f in (4, 5):
            return v
        if f == 6:
            return (v >> 1) ^ -(v & 1)
        if f == 7:
            return bool(v)
    return None


def read_mvt(path, z, x, y):
    """MVT 1 枚を [(層の名前, 属性, [輪（緯度経度の列）])] で返す。面だけ"""
    tile = archive().read(path)
    out = []
    for f, _, layer in _fields(tile):
        if f != 3:
            continue
        name, keys, values, feats, extent = "", [], [], [], 4096
        for lf, _, lv in _fields(layer):
            if lf == 1:
                name = lv.decode("utf-8")
            elif lf == 2:
                feats.append(lv)
            elif lf == 3:
                keys.append(lv.decode("utf-8"))
            elif lf == 4:
                values.append(_value(lv))
            elif lf == 5:
                extent = lv
        for fb in feats:
            tags, gtype, geom = [], 0, []
            for ff, _, fv in _fields(fb):
                if ff == 2:
                    tags = _packed(fv)
                elif ff == 3:
                    gtype = fv
                elif ff == 4:
                    geom = _packed(fv)
            if gtype != 3:
                continue
            props = {keys[tags[i]]: values[tags[i + 1]] for i in range(0, len(tags), 2)}
            rings, ring, cx, cy, i = [], [], 0, 0, 0
            while i < len(geom):
                cmd, count = geom[i] & 7, geom[i] >> 3
                i += 1
                if cmd == 7:
                    if ring:
                        rings.append(ring)
                    ring = []
                    continue
                for _ in range(count):
                    dx, dy = geom[i], geom[i + 1]
                    i += 2
                    cx += (dx >> 1) ^ -(dx & 1)
                    cy += (dy >> 1) ^ -(dy & 1)
                    if cmd == 1 and ring:
                        rings.append(ring)
                        ring = []
                    n = 2 ** z
                    lon = (x + cx / extent) / n * 360 - 180
                    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + cy / extent) / n))))
                    ring.append((lat, lon))
            out.append((name, props, rings))
    return out


def lonlat_tile(lat, lon, z):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
