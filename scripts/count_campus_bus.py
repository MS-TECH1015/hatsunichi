"""空き家から大学へ、乗り換えなしのバスで通えるかを数える。LLM は使わない。依頼「大学へ通える空き家」の根拠の数字を出す。

入力: data/raw/gtfs_nihonkotsu.zip と gtfs_hinomaru.zip（鳥取県オープンデータポータル）、data/world.json の akiya（空き家情報バンクの物件と、その点）
数え方
- 平日の便は、水曜に走る便（calendar.txt の wednesday）
- 大学のバス停は GTFS の停留所名「鳥大」（鳥取大学）と「環境大学前」（公立鳥取環境大学）
- 「乗り換えなし」は、同じ便がその停留所に止まったあとで大学のバス停に止まること
- 物件からは、名前でまとめた停留所の平均の位置のうち、まっすぐいちばん近いものを使う
- 鉄道（JR）は入れていない。湖山には鉄道の駅もあるので、鉄道で通える家はこの数より多い
結果は画面に出さず、印字だけする。数字は data/world.json の依頼 lodging の facts に手で写す
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
CAMPUS = ["鳥大", "環境大学前"]


def table(z, name):
    return list(csv.DictReader(io.StringIO(z.read(name).decode("utf-8-sig"))))


def minutes(t):
    h, m, _ = map(int, t.split(":"))
    return h * 60 + m


def load():
    pos = defaultdict(list)
    direct = {c: defaultdict(list) for c in CAMPUS}
    for zname in ("gtfs_nihonkotsu.zip", "gtfs_hinomaru.zip"):
        z = zipfile.ZipFile(RAW / zname)
        weekday = {r["service_id"] for r in table(z, "calendar.txt") if r["wednesday"] == "1"}
        trips = {r["trip_id"] for r in table(z, "trips.txt") if r["service_id"] in weekday}
        names = {}
        for r in table(z, "stops.txt"):
            names[r["stop_id"]] = r["stop_name"]
            pos[r["stop_name"]].append((float(r["stop_lat"]), float(r["stop_lon"])))
        runs = defaultdict(list)
        for r in table(z, "stop_times.txt"):
            if r["trip_id"] in trips:
                runs[r["trip_id"]].append((int(r["stop_sequence"]), names[r["stop_id"]], r["arrival_time"] or r["departure_time"]))
        for run in runs.values():
            run.sort()
            for c in CAMPUS:
                at = next((i for i, s in enumerate(run) if s[1] == c), None)
                if at is None:
                    continue
                for s in run[:at]:
                    direct[c][s[1]].append(minutes(run[at][2]) - minutes(s[2]))
    centers = {n: (sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps)) for n, ps in pos.items()}
    return centers, direct


def nearest(centers, lat, lon):
    def dist(c):
        return math.hypot((c[1] - lon) * 111320 * math.cos(math.radians(lat)), (c[0] - lat) * 110950)

    name = min(centers, key=lambda n: dist(centers[n]))
    return name, dist(centers[name])


def main():
    centers, direct = load()
    print("停留所（名前でまとめた数）", len(centers))
    for c in CAMPUS:
        print(c, "へ乗り換えなしの平日の便が止まる停留所", len(direct[c]))
    world = json.loads((ROOT / "data" / "world.json").read_text(encoding="utf-8"))
    listed = [a for a in world["akiya"] if a["status"] == "listed"]
    print("空き家情報バンクの登録中の物件", len(listed))
    for a in listed:
        stop, d = nearest(centers, *a["geo"])
        rides = direct["鳥大"].get(stop, [])
        print(f"  {a['town']}: 最寄り {stop}（{d:.0f} m）、鳥大へ平日 {len(rides)} 本、最短 {min(rides, default='-')} 分")


if __name__ == "__main__":
    main()
