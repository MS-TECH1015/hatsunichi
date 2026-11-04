"""鳥取市の未活用施設を、7 つの町の「使える場所」として data/world.json の facilities に入れる。

入力は data/raw/odp_1652_mikatsuyo.csv。鳥取県オープンデータポータルにある鳥取市の未活用施設の一覧で、CC BY。
用途で選び、町の代表点から RADIUS_KM までのものだけを使う。同じ敷地の建物は 1 つの札にまとめる。
一覧が今も正しいかは分からないので、文の最後に「未確認」と書く。
"""
import csv
import json

from build_marks import RAW, WORLD, km, unit, walkable

RADIUS_KM = 2.5
# 人が集まる・泊まる・作業する場所に使える用途だけ。処理場・焼却場・車庫・児童館は使わない
USES = {"公民館", "校舎・園舎", "体育館", "浴場・風呂場外", "食堂・調理室"}
SAME_SITE_KM = 0.1


def rows():
    with open(RAW / "odp_1652_mikatsuyo.csv", encoding="cp932", newline="") as f:
        for r in csv.DictReader(f):
            if r["施設分類"] == "未活用施設" and r["用途"] in USES:
                yield r


def sites(items):
    found = []
    for r in items:
        geo = (float(r["緯度"]), float(r["経度"]))
        site = next((s for s in found if km(s["geo"], geo) < SAME_SITE_KM), None)
        if site is None:
            found.append({"geo": geo, "rows": [r]})
            continue
        site["rows"].append(r)
    return found


def describe(rs):
    names = "・".join(r["建物名称"] for r in rs)
    uses = "・".join(dict.fromkeys(r["用途"] for r in rs))
    areas = "、".join(f"{r['延床面積（㎡）']} ㎡" for r in rs)
    years = "・".join(dict.fromkeys(r["主な建築日"][:4] for r in rs))
    head = "延床" if len(rs) == 1 else "延床は順に"
    shelter = "緊急避難所の指定あり。" if any(r["避難所指定等"] for r in rs) else ""
    return f"{names}。鳥取市の未活用施設。用途は{uses}、{head} {areas}、{years} 年に建った。{shelter}今も使われていないかは未確認"


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    places = world["places"]
    facilities = []
    for site in sites(rows()):
        d, place = min((km(site["geo"], p["geo"]), i) for i, p in enumerate(places))
        if d > RADIUS_KM:
            continue
        p = places[place]
        x, z = unit(*site["geo"])
        px, pz = unit(*p["geo"])
        at = [round(x - px, 1), round(z - pz, 1)]
        if not walkable(p["at"][0] + at[0], p["at"][1] + at[1]):
            print("歩けない所なので外す:", site["rows"][0]["建物名称"])
            continue
        rs = site["rows"]
        facilities.append({
            "id": "fac" + rs[0]["itemID"],
            "place": p["id"],
            "at": at,
            "name": rs[0]["建物名称"] if len(rs) == 1 else f"{rs[0]['建物名称']}ほか {len(rs) - 1} 棟",
            "text": describe(rs),
            "sources": ["odp_facilities"],
        })
    world["facilities"] = facilities
    world["sources"]["odp_facilities"] = {
        "name": "鳥取市 未活用施設の一覧（鳥取県オープンデータポータル）を加工",
        "url": "https://odp-pref-tottori.tori-info.co.jp/dataset/1652.html",
        "date": "2026-11-05",
        "note": "出典：鳥取市「未活用施設」鳥取県オープンデータポータル（https://odp-pref-tottori.tori-info.co.jp/dataset/1652.html）（2026年11月5日に利用）。CC BY。用途で選び、町の近くのものだけを手帳の文に加工した。加工したのは hatsunichi で、鳥取市が作ったものではない。市の公式の募集でもない",
    }
    with open(WORLD, "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(world, ensure_ascii=False, indent=2) + chr(10))
    for f in facilities:
        print(f["place"], f["at"], f["text"][:90])


if __name__ == "__main__":
    main()
