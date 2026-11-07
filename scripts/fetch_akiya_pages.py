"""空き家バンクの登録中の物件ページを、1 件 1 回だけ落とす。再実行しても取得済みは飛ばす。

鳥取市の物件ページ（https://www.city.tottori.lg.jp/page/NNNN.html）は、所在の町名の横に Google マップへのリンクを置き、
その URL に市が公開した点の緯度経度が入っている（2026-11-07 に 50534.html で確認）。build_akiya.py がこの点を使う。
鳥取市のコンテンツは PDL1.0。robots.txt は置いていない（2026-11-07 に確認）。成約済みの物件は取らない
"""
import hashlib
import json
import pathlib
import time
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = RAW / "akiya_pages"
HOST = "https://www.city.tottori.lg.jp/"


def main():
    world = json.loads((ROOT / "data" / "world.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for a in world["akiya"]:
        url = a.get("url") or ""
        if a["status"] == "closed" or not url.startswith(HOST):
            continue
        path = OUT / url.rsplit("/", 1)[1]
        if path.exists():
            continue
        req = urllib.request.Request(url, headers={"User-Agent": "hatsunichi/0.1 (one-time fetch; Built with Claude Japan 2026)"})
        data = urllib.request.urlopen(req, timeout=30).read()
        path.write_bytes(data)
        with open(RAW / "fetch.log", "a", encoding="utf-8") as log:
            log.write(f"{date.today()} {hashlib.sha256(data).hexdigest()} {url}\n")
        print("fetched", path.name, len(data))
        time.sleep(3)  # 連続で叩かない


if __name__ == "__main__":
    main()
