"""国土地理院の最適化ベクトルタイル（地理院地図Vector が読むタイル）を、町の中心から 700 m の範囲だけズーム 16 で 1 回ずつ落とす。
再実行しても取得済みは飛ばす。

タイル: https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf
地理院地図Vector の標準地図風スタイル https://gsi-cyberjapan.github.io/optimal_bvmap/style/std.json がこのタイルを読む（2026-11-07 に確認）。
利用規約: 国土地理院コンテンツ利用規約（PDL1.0）。利用手続のページ https://www.gsi.go.jp/LAW/2930-index.html は、
地理院地図Vector（試験公開）のベクトルタイルを測量成果に当たらないコンテンツとしている（2026-11-07 に確認）。
引数: 町の id。「id:1300」のように半径（m）も渡せる。無ければ PLATEAU の建物が少ない 5 つの町。中心は places[].center、無ければ geo
"""
import hashlib
import json
import math
import pathlib
import sys
import time
import urllib.error
import urllib.request
from datetime import date

URL = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf"
ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = RAW / "gsi_vt"
Z = 16
R_M = 700
RURAL = ["fukube", "ketaka", "kokufu", "mochigase", "sakyu"]


def tile(lat, lon, z):
    n = 2 ** z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def wanted(places, radius):
    out = set()
    for p in places:
        lat, lon = p.get("center") or p["geo"]
        r = radius.get(p["id"], R_M)
        dlat = r / 110950
        dlon = r / (111320 * math.cos(math.radians(lat)))
        x0, y0 = tile(lat + dlat, lon - dlon, Z)
        x1, y1 = tile(lat - dlat, lon + dlon, Z)
        out |= {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}
    return sorted(out)


def main():
    world = json.loads((ROOT / "data" / "world.json").read_text(encoding="utf-8"))
    args = [a.split(":") for a in sys.argv[1:]] or [[i] for i in RURAL]
    radius = {a[0]: int(a[1]) for a in args if len(a) > 1}
    ids = {a[0] for a in args}
    OUT.mkdir(parents=True, exist_ok=True)
    for x, y in wanted([p for p in world["places"] if p["id"] in ids], radius):
        path = OUT / f"{Z}_{x}_{y}.pbf"
        none = path.with_suffix(".none")
        if path.exists() or none.exists():
            continue
        url = URL.format(z=Z, x=x, y=y)
        req = urllib.request.Request(url, headers={"User-Agent": "hatsunichi/0.1 (one-time fetch; Built with Claude Japan 2026)"})
        try:
            data = urllib.request.urlopen(req, timeout=30).read()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            none.write_text("404\n")
            data = None
        with open(RAW / "fetch.log", "a", encoding="utf-8") as log:
            log.write(f"{date.today()} {hashlib.sha256(data).hexdigest() if data else '404'} {url}\n")
        if data:
            path.write_bytes(data)
        print("fetched" if data else "none", path.name, len(data or b""))
        time.sleep(1.5)  # 連続で叩かない


if __name__ == "__main__":
    main()
