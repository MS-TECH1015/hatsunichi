"""実在の町（src/lib/world.ts の REAL_TOWNS）の中の物を、実在の地面の上へ置き直す。1 回だけ流す。

data/world.json の町の中の座標は、もとは市の地図と同じ 1 単位 50 m だった。実在の町では 1 単位 1.5 m（町の原点は places[].geo）。
引数: 町の id（無ければ REAL のすべて）。置き直した物には "placed": true を付け、次に流したときは飛ばす。
build_marks.py や build_facilities.py で札を作り直したあとは、引数なしでもう一度流せばよい
- 町丁の印（marks）と未活用施設（facilities）は、市の地図の座標（町名の代表点 geo_at から測った位置）から実在の位置へ直す。
  実在の町の中心は places[].origin（build_real_towns.py が書く）。町の円（600 m）より外のものは
  "city": true を付けて市の地図の上に残す
- バス停は原点（GTFS の停留所か、位置参照情報の点）にいちばん近い道の上
- 依頼の場所（spots）と住民（npcs）は作り話の配置なので、もとの並びを 3 倍に広げてから近くの道の上へ寄せる。
  実在の家に結びつけない（個人の家を困りごとの家に見せないため）
"""
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORLD = ROOT / "data" / "world.json"
REAL = ["eki", "kumoyama", "koyama", "kawahara", "fukube", "ketaka", "kokufu", "mochigase", "sakyu"]
CITY_M = 50
SPREAD = 3  # 作り話の配置を広げる倍率
CELL = 20


class Town:
    def __init__(self, data):
        self.r = data["radius"]
        self.grid = {}
        for b in data["buildings"]:
            self._add(("b", b["ring"]))
        for a in data["land"]:
            if a["k"] == "water":
                self._add(("w", a["ring"]))
        for a in data["roads"]:
            self._add(("r", a["ring"]))

    def _add(self, item):
        xs = [p[0] for p in item[1]]
        zs = [p[1] for p in item[1]]
        for gx in range(int(min(xs) // CELL), int(max(xs) // CELL) + 1):
            for gz in range(int(min(zs) // CELL), int(max(zs) // CELL) + 1):
                self.grid.setdefault((gx, gz), []).append(item)

    def kinds(self, x, z):
        out = set()
        for k, ring in self.grid.get((int(x // CELL), int(z // CELL)), []):
            if k not in out and inside(ring, x, z):
                out.add(k)
        return out

    def ok(self, x, z, road):
        if math.hypot(x, z) > self.r - 8:
            return False
        for dx, dz in ((0, 0), (1.5, 0), (-1.5, 0), (0, 1.5), (0, -1.5)):
            k = self.kinds(x + dx, z + dz)
            if "b" in k or ("w" in k and "r" not in k):
                return False
        return not road or "r" in self.kinds(x, z)

    def snap(self, target, taken, gap):
        for road in (True, False):
            for r in range(0, 80):
                n = max(1, int(2 * math.pi * r / 1.5))
                for i in range(n):
                    a = 2 * math.pi * i / n
                    x, z = target[0] + r * math.cos(a), target[1] + r * math.sin(a)
                    if self.ok(x, z, road) and all(math.dist((x, z), t) >= gap for t in taken):
                        return [round(x, 1), round(z, 1)]
        raise RuntimeError(f"置ける所が無い: {target}")


def inside(ring, x, z):
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            hit = not hit
        j = i
    return hit


def main():
    world = json.loads(WORLD.read_text(encoding="utf-8"))
    k = CITY_M / json.loads((ROOT / "public/city/towns/eki.json").read_text(encoding="utf-8"))["m_per_unit"]
    for pid in sys.argv[1:] or REAL:
        town = Town(json.loads((ROOT / f"public/city/towns/{pid}.json").read_text(encoding="utf-8")))
        place = next(p for p in world["places"] if p["id"] == pid)
        taken = []
        place["stop"] = town.snap([0, 0], taken, 0)
        taken.append(place["stop"])
        if world["meta"]["start"]["place"] == pid:
            world["meta"]["start"]["at"] = town.snap([place["stop"][0], place["stop"][1] + 4], taken, 2.5)
            taken.append(world["meta"]["start"]["at"])
        for key in ("spots", "npcs", "marks", "facilities"):
            taken += [s["at"] for s in world[key] if s["place"] == pid and s.get("placed")]
        for key in ("spots", "npcs"):
            for s in world[key]:
                if s["place"] != pid or s.get("placed"):
                    continue
                s["at"] = town.snap([s["at"][0] * SPREAD, s["at"][1] * SPREAD], taken, 3 if key == "spots" else 2.5)
                s["placed"] = True
                taken.append(s["at"])
        for key in ("marks", "facilities"):
            for m in world[key]:
                if m["place"] != pid or m.get("placed") or m.get("city"):
                    continue
                real = [(m["at"][0] + place["geo_at"][0] - place["origin"][0]) * k, (m["at"][1] + place["geo_at"][1] - place["origin"][1]) * k]
                if math.hypot(*real) > town.r - 10:
                    m["city"] = True
                    continue
                m["at"] = town.snap(real, taken, 3)
                m["placed"] = True
                taken.append(m["at"])
        print(pid, "置いた", len(taken), "市の地図に残した", sum(1 for key in ("marks", "facilities") for m in world[key] if m["place"] == pid and m.get("city")))
    with open(WORLD, "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(world, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
