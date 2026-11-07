"""「自分の町から近いもの」を出すための下ごしらえ。LLM は使わない。

入力: data/raw/isj_31000-19.0b.zip（位置参照情報 大字・町丁目）、data/raw/gtfs_nihonkotsu.zip と gtfs_hinomaru.zip（バス）
出力: public/city/near.json
  chome: [[町丁名, x, z]]  鳥取市の大字・町丁目の代表点。市の地図の座標（1 単位 50 m）
  stops: [[停留所名, x, z, 平日の便]]  鳥取市の中の停留所。同じ名前の乗り場はまとめて、位置は平均。
         平日の便は、水曜に走る便がその停留所に止まる回数（上りと下りの合計、終点に着く便も 1 と数える）
画面は使う人が選んだ町丁名を、その人のブラウザの中でだけ使う。どこにも送らない。
"""
import csv
import io
import json
import math
import pathlib
import zipfile
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
city = json.loads((ROOT / "public" / "city" / "city.json").read_text(encoding="utf-8"))
ORIGIN = city["origin"]
GRID = city["grid"]
MASK = (ROOT / "public" / "city" / "mask.bin").read_bytes()
KX = 111320 * math.cos(math.radians(ORIGIN["lat"])) / ORIGIN["m_per_unit"]
KZ = 110950 / ORIGIN["m_per_unit"]


def unit(lat, lon):
    return round((lon - ORIGIN["lon"]) * KX, 2), round(-(lat - ORIGIN["lat"]) * KZ, 2)


def in_city(x, z):
    q = int((x - GRID["x0"]) / GRID["cell"])
    r = int((z - GRID["z0"]) / GRID["cell"])
    return 0 <= q < GRID["w"] and 0 <= r < GRID["h"] and MASK[r * GRID["w"] + q] & 2


def table(z, name):
    return list(csv.DictReader(io.StringIO(z.read(name).decode("utf-8-sig"))))


def chome():
    z = zipfile.ZipFile(RAW / "isj_31000-19.0b.zip")
    name = next(n for n in z.namelist() if n.endswith(".csv"))
    out = []
    for r in csv.DictReader(io.StringIO(z.read(name).decode("cp932"))):
        if r["市区町村名"] != "鳥取市":
            continue
        out.append([r["大字町丁目名"], *unit(float(r["緯度"]), float(r["経度"]))])
    return out


def stops():
    pos = defaultdict(list)
    count = defaultdict(int)
    for zname in ("gtfs_nihonkotsu.zip", "gtfs_hinomaru.zip"):
        z = zipfile.ZipFile(RAW / zname)
        weekday = {r["service_id"] for r in table(z, "calendar.txt") if r["wednesday"] == "1"}
        trips = {r["trip_id"] for r in table(z, "trips.txt") if r["service_id"] in weekday}
        names = {}
        for r in table(z, "stops.txt"):
            names[r["stop_id"]] = r["stop_name"]
            pos[r["stop_name"]].append(unit(float(r["stop_lat"]), float(r["stop_lon"])))
        for r in table(z, "stop_times.txt"):
            if r["trip_id"] in trips:
                count[names[r["stop_id"]]] += 1
    out = []
    for name, ps in pos.items():
        x = round(sum(p[0] for p in ps) / len(ps), 2)
        z = round(sum(p[1] for p in ps) / len(ps), 2)
        if in_city(x, z):
            out.append([name, x, z, count[name]])
    return out


def main():
    data = {"chome": chome(), "stops": stops()}
    path = ROOT / "public" / "city" / "near.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("町丁", len(data["chome"]), "停留所", len(data["stops"]), "bytes", path.stat().st_size)
    print(sorted(data["stops"], key=lambda s: -s[3])[:3])


if __name__ == "__main__":
    main()
