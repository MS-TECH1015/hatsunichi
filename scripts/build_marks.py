"""町の印（data/world.json の marks）を作る。

町丁ごとに 1 つ。令和2年国勢調査の人口と 65 歳以上の割合、平成27年からの増減、
いちばん近い病院（国土数値情報 P04 令和2年度）と小学校（P29 令和5年度。義務教育学校を含む）までの直線距離を並べる。
印は e-Stat 境界データの図形中心点に置き、いちばん近い場所（places）の中の座標に直す。
場所の at は build_city.py が平らな所へ寄せているので、緯度経度の差を場所の at に足す。

使い方: python scripts/build_marks.py （data/raw に scripts/fetch.sh の e-Stat と国土数値情報の 5 ファイルが要る）
"""
import csv
import io
import json
import math
import struct
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
WORLD = ROOT / "data" / "world.json"
CITY = ROOT / "public" / "city"

RADIUS_M = 1500  # 場所からこの距離までの町丁を拾う
PER_PLACE = 5  # 1 つの場所に置く印の上限。場所に近い順
GAP = 6  # 印どうしの間（単位）。近すぎると続けて手帳に入り、読む間がない
CLEAR = 4  # 依頼の場所・住民・バス停・始まりの位置から離す（単位）

city = json.loads((CITY / "city.json").read_text(encoding="utf-8"))
ORIGIN = city["origin"]
KX = 111320 * math.cos(math.radians(ORIGIN["lat"])) / ORIGIN["m_per_unit"]
KZ = 110950 / ORIGIN["m_per_unit"]
GRID = city["grid"]
MASK = (CITY / "mask.bin").read_bytes()


def unit(lat, lon):
    return ((lon - ORIGIN["lon"]) * KX, -(lat - ORIGIN["lat"]) * KZ)


def km(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def walkable(x, z):
    q = round((x - GRID["x0"]) / GRID["cell"])
    r = round((z - GRID["z0"]) / GRID["cell"])
    return 0 <= q < GRID["w"] and 0 <= r < GRID["h"] and MASK[r * GRID["w"] + q] & 1 == 1


def dbf_rows(data):
    n, head, size = struct.unpack("<IHH", data[4:12])
    fields = [(data[i:i + 11].split(bytes([0]))[0].decode("ascii"), data[i + 16]) for i in range(32, head - 1, 32)]
    for k in range(n):
        rec = data[head + k * size + 1: head + (k + 1) * size]
        row, o = {}, 0
        for name, length in fields:
            row[name] = rec[o:o + length].decode("cp932").strip()
            o += length
        yield row


def town_points():
    """鳥取市の町丁ごとの図形中心点。1 つの町丁が複数の図形に分かれていれば、いちばん広いもの"""
    best = {}
    for r in dbf_rows(zipfile.ZipFile(RAW / "estat_r2ka31.zip").read("r2ka31.dbf")):
        if r["CITY"] != "201" or r["HCODE"] != "8101":
            continue
        area = float(r["AREA"])
        if best.get(r["KEY_CODE"], (0,))[0] >= area:
            continue
        best[r["KEY_CODE"]] = (area, float(r["Y_CODE"]), float(r["X_CODE"]))
    return {k: (lat, lon) for k, (_, lat, lon) in best.items()}


def num(v):
    if v == "-":
        return 0
    return int(v) if v.isdigit() else None


def ages(zip_name, inner):
    """町丁ごとの (名前, 総数, 年齢の分かる人, 65 歳以上)。秘匿の町丁は入れない"""
    rows = list(csv.reader(io.StringIO(zipfile.ZipFile(RAW / zip_name).read(inner).decode("cp932"))))
    label = [unicodedata.normalize("NFKC", x).strip() for x in rows[1]]
    total = next(i for i, x in enumerate(label) if x.startswith("総数"))
    young = label.index("総数15歳未満")
    old = label.index("総数65歳以上")
    middle = young + 1
    assert label[middle].startswith("総数15") and label[middle].endswith("64歳"), label[middle]
    out = {}
    for r in rows[2:]:
        if not r[0].startswith("31201") or r[4] == "1":
            continue
        n, y, m, o = (num(r[i]) for i in (total, young, middle, old))
        if None in (n, y, m, o):
            continue
        out[r[0]] = (r[3], n, y + m + o, o)
    return out


def facilities(zip_name, inner, keep):
    g = json.loads(zipfile.ZipFile(RAW / zip_name).read(inner).decode("utf-8"))
    return [(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]) for f in g["features"] if keep(f["properties"])]


def nearest_km(geo, spots):
    d = min(km(geo, s) for s in spots)
    if d < 0.1:
        return "100 m 以内"
    return f"{d:.1f} km" if d < 10 else f"{d:.0f} km"


def describe(name, now, before, hospital, school):
    _, n, known, old = now
    words = [f"{name}。住む人 {n:,} 人"]
    if known:
        words[0] += f"で、65歳以上が {round(100 * old / known)}%"
    if before is not None:
        d = n - before[1]
        words.append(f"5年で {-d:,} 人減った" if d < 0 else f"5年で {d:,} 人増えた" if d > 0 else "5年前と同じ人数")
    words.append(f"いちばん近い病院まで まっすぐ {hospital}、小学校まで {school}")
    return "。".join(words)


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    places = world["places"]
    base = {p["id"]: p["at"] for p in places}

    def at(place, v):
        return (base[place][0] + v[0], base[place][1] + v[1])

    taken = [at(s["place"], s["at"]) for s in world["spots"] + world["npcs"]]
    taken += [at(p["id"], p["stop"]) for p in places if p.get("stop")]
    taken.append(at(world["meta"]["start"]["place"], world["meta"]["start"]["at"]))

    points = town_points()
    now = ages("estat_T001082_31.zip", "tblT001082C31.txt")
    before = ages("estat_T000849_31.zip", "tblT000849C31.txt")
    hospitals = facilities("ksj_P04-20_31.zip", "P04-20_31_GML/P04-20_31.geojson", lambda p: p["P04_001"] == 1)
    schools = facilities("ksj_P29-23_31.zip", "P29-23_31_GML/P29-23_31.geojson", lambda p: p["P29_003"] in ("16001", "16014"))
    print(f"町丁 {len(points)}  人口あり {len(now)}  5年前あり {len(before)}  病院 {len(hospitals)}  小学校 {len(schools)}")

    near = []
    for key, geo in points.items():
        if key not in now:
            continue
        place = min(places, key=lambda p: km(geo, p["geo"]))
        d = km(geo, place["geo"])
        if d * 1000 <= RADIUS_M:
            near.append((d, key, geo, place))
    near.sort(key=lambda c: c[0])

    marks, spots, count = [], [], {}
    for _, key, geo, place in near:
        if count.get(place["id"], 0) >= PER_PLACE:
            continue
        gx, gz = unit(*geo)
        px, pz = unit(*place["geo"])
        rel = [round(gx - px, 1), round(gz - pz, 1)]
        spot = at(place["id"], rel)
        if not walkable(*spot) or any(math.dist(spot, t) < CLEAR for t in taken) or any(math.dist(spot, m) < GAP for m in spots):
            continue
        spots.append(spot)
        count[place["id"]] = count.get(place["id"], 0) + 1
        text = describe(now[key][0], now[key], before.get(key), nearest_km(geo, hospitals), nearest_km(geo, schools))
        marks.append({"id": key, "place": place["id"], "at": rel, "text": text, "sources": ["census_small", "ksj_facilities"]})
    order = [p["id"] for p in places]
    marks.sort(key=lambda m: (order.index(m["place"]), m["id"]))

    world["marks"] = marks
    # 市全体の 65 歳以上の割合。表の KEY_CODE 31201 の行が鳥取市の合計。1 枚の「関わる人」で、その町と比べる
    _, city_people, city_known, city_old = now["31201"]
    world["cityAge"] = {"people": city_people, "oldShare": round(100 * city_old / city_known)}
    world["sources"]["census_small"] = {
        "name": "国勢調査 令和2年・平成27年 小地域集計と境界（総務省、e-Stat）を加工",
        "url": "https://www.e-stat.go.jp/",
        "date": "2026-11-04",
        "note": "出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）。「国勢調査」（総務省）を加工して作成。町丁ごとの人口総数、65歳以上の割合（年齢の分かる人に対して）、平成27年からの増減を出し、境界データの図形中心点に印を置いた。秘匿の町丁は使っていない。政府標準利用規約 第2.0版",
    }
    world["sources"]["ksj_facilities"] = {
        "name": "国土数値情報 医療機関 令和2年度・学校 令和5年度（国土交通省）を加工",
        "url": "https://nlftp.mlit.go.jp/ksj/",
        "date": "2026-11-04",
        "note": "『国土数値情報（医療機関データ）』（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P04-2020.html）と『国土数値情報（学校データ）』（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P29-2023.html）をもとに作成。町丁の図形中心点から、県内の病院（医療機関分類が病院のもの）と小学校（学校分類が小学校と義務教育学校のもの）までの直線距離で、道のりではない。病院は令和2年度、学校は令和5年度の時点。CC BY 4.0",
    }
    with open(WORLD, "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(world, ensure_ascii=False, indent=2) + chr(10))
    for p in places:
        print(p["id"], count.get(p["id"], 0))


if __name__ == "__main__":
    main()
