"""鳥取市 空き家情報バンクの物件を、町名の代表点に置く。LLM は使わない。

入力: data/raw/akiya_bank_5828.html（市の登録物件一覧のページ。取得は data/SOURCES.md の akiya_bank_list）
      data/raw/isj_31000-19.0b.zip（位置参照情報 大字・町丁目レベル、令和7年）
出力: data/world.json の akiya。市の地図の座標（1 単位 50 m）と緯度経度、町名、物件ページの URL。
番地・写真・価格・間取りは使わない。点は町名の代表点で、建物の位置ではない。
"""
import csv
import html
import io
import json
import math
import pathlib
import re
import sys
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from place_in_real_towns import REAL, Town  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
WORLD = ROOT / "data" / "world.json"
BASE = "https://www.city.tottori.lg.jp"
STATUS = ["listed", "uji", "closed"]  # ページの表の順: 登録物件、UJI ターン向け、成約済み

city = json.loads((ROOT / "public" / "city" / "city.json").read_text(encoding="utf-8"))
ORIGIN = city["origin"]
KX = 111320 * math.cos(math.radians(ORIGIN["lat"])) / ORIGIN["m_per_unit"]
KZ = 110950 / ORIGIN["m_per_unit"]


def unit(lat, lon):
    return [round((lon - ORIGIN["lon"]) * KX, 2), round(-(lat - ORIGIN["lat"]) * KZ, 2)]


def towns():
    z = zipfile.ZipFile(RAW / "isj_31000-19.0b.zip")
    name = next(n for n in z.namelist() if n.endswith(".csv"))
    rows = csv.DictReader(io.StringIO(z.read(name).decode("cp932")))
    return {r["大字町丁目名"]: (float(r["緯度"]), float(r["経度"])) for r in rows if r["市区町村名"] == "鳥取市"}


def clean(cell):
    return re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", cell)))


def listings():
    page = (RAW / "akiya_bank_5828.html").read_text(encoding="utf-8", errors="replace")
    out = []
    for status, table in zip(STATUS, re.findall(r"<table.*?</table>", page, re.S)):
        rows = [[clean(c) for c in re.findall(r"<t[dh].*?</t[dh]>", r, re.S)] for r in re.findall(r"<tr.*?</tr>", table, re.S)]
        links = [re.search(r'href="([^"]+)"', r) for r in re.findall(r"<tr.*?</tr>", table, re.S)]
        col = rows[0].index("所在地") if "所在地" in rows[0] else None
        for cells, link in zip(rows[1:], links[1:]):
            addr = cells[col] if col is not None else next(c for c in cells if c.startswith("鳥取市"))
            out.append({"no": cells[0].removeprefix("No."), "status": status, "town": addr.removeprefix("鳥取市"), "url": BASE + link.group(1) if link and link.group(1).startswith("/") else (link.group(1) if link else None)})
    return out


def in_real_town(world, geo, taken):
    """実在の町の円の中なら、その町の中の座標（1 単位 1.5 m）で道の上へ寄せた点"""
    for pid in REAL:
        place = next(p for p in world["places"] if p["id"] == pid)
        data = json.loads((ROOT / f"public/city/towns/{pid}.json").read_text(encoding="utf-8"))
        m = data["m_per_unit"]
        x = (geo[1] - place["geo"][1]) * 111320 * math.cos(math.radians(place["geo"][0])) / m
        z = -(geo[0] - place["geo"][0]) * 110950 / m
        if math.hypot(x, z) > data["radius"] - 15:
            continue
        town = Town(data)
        at = town.snap([x, z], taken.setdefault(pid, []), 3)
        taken[pid].append(at)
        return {"place": pid, "at": at}
    return None


def main():
    points = towns()
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    akiya = []
    taken = {}
    for item in listings():
        geo = points.get(item["town"])
        if not geo:
            print("町名が位置参照情報に無い:", item["town"])
            continue
        a = {"id": f"akiya-{item['no']}", "status": item["status"], "town": item["town"], "geo": [geo[0], geo[1]], "at": unit(*geo), "url": item["url"], "sources": ["akiya_bank_list", "isj_oaza"]}
        real = in_real_town(world, geo, taken)
        if real:
            a["real"] = real
        akiya.append(a)
    world["akiya"] = akiya
    world["sources"]["akiya_bank_list"] = {
        "name": "鳥取市 空き家情報バンク 登録物件一覧（2026年10月16日更新）",
        "url": "https://www.city.tottori.lg.jp/page/5828.html",
        "date": "2026-11-07",
        "note": "鳥取市のページ（PDL1.0）から、物件の番号・登録か成約済みか・所在の町名だけを使った。点は町名の代表点で、建物の位置ではない。写真・価格・番地は載せない。UJI ターン向けの物件は鳥取県の移住サイトのページへつなぐ",
    }
    world["sources"]["isj_oaza"] = {
        "name": "大字・町丁目位置参照情報 国土交通省（令和7年、31000-19.0b）を加工",
        "url": "https://nlftp.mlit.go.jp/isj/",
        "date": "2026-11-03",
        "note": "町名から代表点の緯度経度を引いた。位置参照情報ダウンロードサービス利用約款に沿って出典を書く",
    }
    with open(WORLD, "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(world, ensure_ascii=False, indent=2) + "\n")
    for a in akiya:
        print(a["status"], a["town"], a["at"], a["url"])


if __name__ == "__main__":
    main()
