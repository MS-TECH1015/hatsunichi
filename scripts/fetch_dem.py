"""国土地理院の標高タイル（DEM10B, dem_png）を、鳥取市の範囲だけ1回ずつ落とす。再実行しても取得済みは飛ばす。

仕様: https://maps.gsi.go.jp/development/demtile.html （x = 2^16R + 2^8G + B、u = 0.01m、無効値は (128,0,0)）
一覧と出典: https://maps.gsi.go.jp/development/ichiran.html
範囲は国土数値情報 N03 の鳥取市の外枠。ズーム 11 で 1 画素およそ 60m。
"""
import hashlib
import math
import pathlib
import time
import urllib.request
from datetime import date

Z = 11
BBOX = (133.946, 35.2716, 134.4408, 35.5732)  # 西, 南, 東, 北
URL = "https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png"
RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = RAW / "dem"


def tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    x0, y0 = tile(BBOX[0], BBOX[3], Z)
    x1, y1 = tile(BBOX[2], BBOX[1], Z)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            path = OUT / f"{Z}_{x}_{y}.png"
            if path.exists():
                print("skip", path.name)
                continue
            url = URL.format(z=Z, x=x, y=y)
            req = urllib.request.Request(url, headers={"User-Agent": "hatsunichi/0.1 (one-time fetch; Built with Claude Japan 2026)"})
            data = urllib.request.urlopen(req, timeout=30).read()
            path.write_bytes(data)
            with open(RAW / "fetch.log", "a", encoding="utf-8") as log:
                log.write(f"{date.today()} {hashlib.sha256(data).hexdigest()} {url}\n")
            print("fetched", path.name, len(data))
            time.sleep(1.5)  # 連続で叩かない


if __name__ == "__main__":
    main()
