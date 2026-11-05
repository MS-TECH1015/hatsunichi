"""7 つの場所を、歩いて回れる町に組む。

通り・歩道・横断歩道・広場・木道の四角と、家・塀・電柱・街灯などの飾りの位置を決める。
座標は場所の中（場所の中心が原点、+x 東、+z 南）。町は東西の本通りと南北の通りの十字で、軸にそろえて置く。
実在の町並みではなく、作者が決めた見た目の配置。乱数は場所ごとに固定する。
scripts/build_city.py から呼ぶ。
"""
import math
import random

R_STREET = 18  # 通りの端
R_LOTS = 14  # 家を置く範囲
R_RING = 19  # 町のまわりに木を散らす範囲
R_CUT = 21  # 町の外から来るバス道を、ここで切って通りの端へつなぐ
MIN_ARM = 8  # これより短くしか伸ばせない通りは作らない
SHELTER = (-6.0, -3.0)  # 乗れるバス停の屋根
STOP = [-4.2, -2.4]  # 話しかける標識の位置。屋根の東の端に立つ
LANE = -0.9  # バスが本通りを走る線

STYLE = {"eki": "station", "kumoyama": "street", "koyama": "street", "fukube": "rural", "ketaka": "rural", "kawahara": "rural", "kokufu": "rural", "mochigase": "mountain", "sakyu": "dune"}

# 重ならないように置くための半径
RADIUS = {
    "house": 2.2, "house_b": 2.2, "house_lo": 1.5, "shop": 2.2, "station": 3.0, "paddy": 3.2,
    "block_wall": 1.0, "hedge": 1.0, "fence": 1.0, "guardrail": 1.1, "dune_fence": 1.1,
    "tree_round": 0.9, "tree_cone": 0.9, "shrub": 0.5, "rock": 0.5, "dune_grass": 0.4,
    "planter": 0.35, "vending": 0.7, "bicycle": 0.5, "kei_car": 0.9, "pole": 0.3, "street_lamp": 0.3,
    "curve_mirror": 0.3, "guide_board": 0.6, "bench": 0.8, "flowers": 0.9, "bus_shelter": 1.4, "lookout": 2.6, "hill": 9.0,
}
# 細長い物の長さ。塀や柵は模型の X 方向、車と自転車は正面の向きに長い
LONG_X = {"block_wall": 2.2, "hedge": 2.2, "fence": 2.0, "guardrail": 2.4, "dune_fence": 2.4, "bench": 1.6}
LONG_Y = {"kei_car": 3.4, "bicycle": 1.6}
# 歩く人がぶつからない物
PASS = {"dune_grass"}


def turn(face, x, z):
    """模型の (x, z) を face の向きに回す。three.js の rotation.y = face·π/2 と同じ"""
    a = face * math.pi / 2
    return x * math.cos(a) + z * math.sin(a), -x * math.sin(a) + z * math.cos(a)


class Town:
    def __init__(self, pid, reserved, ok):
        self.pid = pid
        self.style = STYLE[pid]
        self.rng = random.Random(pid)
        self.ok = ok  # 場所の中の座標で、歩ける地面か
        self.paving, self.props, self.wires, self.blocks, self.ends = [], [], [], [], []
        self.taken = list(reserved)  # (x, z, 半径)
        self.rural = self.style in ("rural", "mountain")
        self.half = 1.6 if self.rural else 2.0  # 本通りの半分の幅
        self.cw = 1.2 if self.rural else 1.6  # 南北の通りの半分の幅
        self.walk = 0.0 if self.rural else 1.8  # 歩道の幅
        self.arm = {d: self.reach(d) for d in "ewsn"}
        if self.style == "station":
            self.arm["n"] = 0
        if self.style == "dune":
            self.arm.update(e=0, w=0, n=0)

    # ---- 置く道具 ----
    def reach(self, d):
        """通りをどこまで伸ばせるか。水や市の外にかかる手前で止める"""
        dx, dz = {"e": (1, 0), "w": (-1, 0), "s": (0, 1), "n": (0, -1)}[d]
        for length in range(R_STREET, MIN_ARM - 1, -1):
            if all(self.ok(dx * t + dz * o, dz * t + dx * o) for t in range(0, length + 1) for o in (-3, 0, 3)):
                return length
        return 0

    def pave(self, kind, x1, z1, x2, z2):
        self.paving.append([kind, round(min(x1, x2), 2), round(min(z1, z2), 2), round(max(x1, x2), 2), round(max(z1, z2), 2)])

    def on_paving(self, x, z, r):
        return any(a - r < x < c + r and b - r < z < d + r for k, a, b, c, d in self.paving if k != "line")

    def free(self, x, z, r):
        if not all(self.ok(x + dx * r * 0.7, z + dz * r * 0.7) for dx, dz in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1))):
            return False
        return all(math.hypot(x - a, z - b) >= r + c for a, b, c in self.taken)

    def put(self, kind, x, z, face=0, scale=1.0, var=0, on_paving=False):
        """置けたら True。on_paving が False なら通りや歩道の上には置かない"""
        r = RADIUS.get(kind, 0.5) * scale * (0.5 if kind in LONG_X else 1)
        if not self.free(x, z, r):
            return False
        if not on_paving and self.on_paving(x, z, 0.2 if kind in LONG_X else r * 0.8):
            return False
        if kind == "station":
            self.taken += [(x + dx, z, 3.0) for dx in (-5.5, -2.75, 0, 2.75, 5.5)]
        else:
            self.taken.append((x, z, r))
        self.props.append([kind, round(x, 2), round(z, 2), face % 4, round(scale, 2), var])
        self.block(kind, x, z, face, scale)
        return True

    def block(self, kind, x, z, face, scale):
        """歩く人がぶつかる円。細長い物は円を並べる"""
        if kind in PASS:
            return
        if kind == "station":
            self.blocks += [[round(x + dx, 2), z, 3.0] for dx in (-5.5, -2.75, 0, 2.75, 5.5)]
            return
        if kind in LONG_X or kind in LONG_Y:
            length = (LONG_X.get(kind) or LONG_Y[kind]) * scale
            ux, uz = turn(face, 1, 0) if kind in LONG_X else turn(face, 0, 1)
            r = 0.8 if kind == "kei_car" else 0.35
            for t in (-length / 3, 0, length / 3):
                self.blocks.append([round(x + ux * t, 2), round(z + uz * t, 2), r])
            return
        self.blocks.append([round(x, 2), round(z, 2), round(RADIUS.get(kind, 0.5) * scale * 0.9, 2)])

    def chance(self, p):
        return self.rng.random() < p

    # ---- 通り ----
    def streets(self):
        if self.style == "dune":
            s = self.arm["s"]
            self.pave("asphalt", -9, -3.5, 9, 3)
            self.pave("asphalt", -1.6, 3, 1.6, s)
            self.pave("boardwalk", -0.9, -13, 0.9, -3.5)
            for x in (-7.5, -5, -2.5, 2.5, 5, 7.5):  # 駐車場の白線
                self.pave("line", x + 0.85, -0.2, x + 0.95, 3)
            self.ends = [(0, s)]
            return
        e, w, s, n = (self.arm[d] for d in "ewsn")
        half, cw, walk = self.half, self.cw, self.walk
        east, west = max(e, cw + 3.4), max(w, cw + 3.4)
        cross = "gravel" if self.rural else "asphalt"
        self.pave("asphalt", -west, -half, east, half)
        if s:
            self.pave(cross, -cw, half, cw, s)
        if n:
            self.pave(cross, -cw, -n, cw, -half)
        self.markings()
        if not self.rural:
            self.sidewalks(east, west, s, n)
        self.ends = [p for p, d in (((e, 0), e), ((-w, 0), w), ((0, s), s), ((0, -n), n)) if d]

    def sidewalks(self, east, west, s, n):
        half, cw, walk = self.half, self.cw, self.walk
        # 本通りの南側。南へ通りがあれば交差点で切る
        if s:
            self.pave("sidewalk", cw, half, east, half + walk)
            self.pave("sidewalk", -west, half, -cw, half + walk)
            self.pave("sidewalk", cw, half + walk, cw + 1.6, s)
            self.pave("sidewalk", -cw - 1.6, half + walk, -cw, s)
        else:
            self.pave("sidewalk", -west, half, east, half + walk)
        if self.style == "station":
            self.pave("plaza", -11, -13, 11, -half)
            self.pave("sidewalk", 11, -half - walk, east, -half)
            self.pave("sidewalk", -west, -half - walk, -11, -half)
            return
        if n:
            self.pave("sidewalk", cw, -half - walk, east, -half)
            self.pave("sidewalk", -west, -half - walk, -cw, -half)
            self.pave("sidewalk", cw, -n, cw + 1.6, -half - walk)
            self.pave("sidewalk", -cw - 1.6, -n, -cw, -half - walk)
        else:
            self.pave("sidewalk", -west, -half - walk, east, -half)

    def markings(self):
        """白線。本通りの中央の破線と端の線、交差点の横断歩道"""
        half, cw = self.half, self.cw
        gap = cw + (0.6 if self.rural else 2.6)
        for sign, d in ((1, "e"), (-1, "w")):
            reach = self.arm[d]
            x = gap
            while x + 1.2 < reach:
                self.pave("line", sign * x, -0.07, sign * (x + 1.2), 0.07)
                x += 2.4
            if reach > gap:
                for edge in (half - 0.3, -half + 0.3):
                    self.pave("line", sign * gap, edge - 0.05, sign * reach, edge + 0.05)
        if self.rural:
            return
        for sign, d in ((1, "s"), (-1, "n")):
            reach = self.arm[d]
            z = half + 4.0
            while reach and z + 1.2 < reach:
                self.pave("line", -0.07, sign * z, 0.07, sign * (z + 1.2))
                z += 2.4
        if self.arm["s"] or self.arm["n"]:
            for sign in (1, -1):
                cx = sign * (cw + 1.5)
                z = -half + 0.25
                while z + 0.45 < half - 0.2:
                    self.pave("line", cx - 0.7, z, cx + 0.7, z + 0.45)
                    z += 0.9
        for sign, d in ((1, "s"), (-1, "n")):
            if not self.arm[d]:
                continue
            cz = sign * (half + 2.6)
            x = -cw + 0.2
            while x + 0.45 < cw - 0.15:
                self.pave("line", x, cz - 0.7, x + 0.45, cz + 0.7)
                x += 0.9

    # ---- 通りの備品 ----
    def furniture(self):
        if self.style == "dune":
            return self.dune()
        sx, sz = SHELTER
        if not self.put("bus_shelter", sx, sz, 0, on_paving=True):
            raise SystemExit(f"バス停の屋根が置けない: {self.pid}")
        self.put("guide_board", sx - 2.6, sz - 0.3, 0, on_paving=True)
        # 電柱は本通りの北側。続く 2 本を電線でつなぐ
        pz = -(self.half + (1.5 if not self.rural else 0.9))
        row = []
        for x in (-16.5, -10.5, -3.6, 3.6, 10.5, 16.5):
            if self.style == "station" and abs(x) < 11:
                continue
            reach = self.arm["e" if x > 0 else "w"]
            if abs(x) < reach and self.put("pole", x, pz, 1, on_paving=True):
                row.append(x)
        for a, b in zip(row, row[1:]):
            if b - a <= 7.5:
                self.wires.append([a, pz, b, pz])
        if self.rural:
            for x in (-12, -7, 7, 12):
                if abs(x) + 1.5 < self.arm["e" if x > 0 else "w"] and self.chance(0.6):
                    self.put("guardrail", x, self.half + 0.5, 0, on_paving=True)
            return
        lz = self.half + 1.5
        for x in (-13.5, -7.5, 7.5, 13.5):
            if abs(x) < self.arm["e" if x > 0 else "w"]:
                self.put("street_lamp", x, lz, 2, on_paving=True)
        if self.arm["s"]:
            self.put("curve_mirror", self.cw + 1.3, self.half + 1.4, 3, on_paving=True)
        if self.arm["n"]:
            self.put("curve_mirror", -self.cw - 1.3, -self.half - 1.4, 1, on_paving=True)
        if self.style == "station":
            self.plaza()

    def plaza(self):
        self.put("station", 0, -15.6, 0, on_paving=True)
        self.put("bus_shelter", 6, SHELTER[1], 0, on_paving=True)
        for x in (-6.5, 6.5):
            self.put("flowers", x, -9, 0, 1.2, on_paving=True)
            self.put("bench", x * 0.55, -10.4, 0, on_paving=True)
        for x, z in ((-9.6, -5.5), (9.6, -5.5), (-9.6, -11.2), (9.6, -11.2)):
            self.put("tree_round", x, z, 0, 0.75, on_paving=True)
            self.put("planter", x + 1.1 * (1 if x < 0 else -1), z + 1.1, 0, on_paving=True)
        self.put("street_lamp", 0, -9.6, 2, on_paving=True)
        for i in range(5):
            self.put("bicycle", -10.2 + i * 0.6, -12.4, 0, var=i, on_paving=True)

    def dune(self):
        sx, sz = SHELTER
        if not self.put("bus_shelter", sx, sz, 0, on_paving=True):
            raise SystemExit(f"バス停の屋根が置けない: {self.pid}")
        self.put("guide_board", -2.4, -3.0, 0, on_paving=True)
        for x in (3.5, 6.0):
            self.put("bench", x, -2.7, 0, on_paving=True)
        self.put("vending", 8.4, -2.8, 0, on_paving=True)
        for i, x in enumerate((-7.5, -2.5, 2.5, 7.5)):
            if self.chance(0.75):
                self.put("kei_car", x + 1.25, 1.4, 2, var=self.rng.randrange(5), on_paving=True)
        for z in (-5, -7.4, -9.8, -12.2):
            self.put("dune_fence", -1.6, z, 1, on_paving=True)
            self.put("dune_fence", 1.6, z, 1, on_paving=True)
        self.put("lookout", 0, -15.6, 0, on_paving=True)
        for x, z in ((-11, 4), (-12.5, 7), (11, 4.5), (12.8, 7.5), (-10, 9.5), (10.5, 10), (-4, 8), (4.5, 11)):
            self.put("tree_cone", x, z, 0, 0.9, var=1)
        for _ in range(220):
            a, d = self.rng.random() * math.tau, 3 + self.rng.random() * 15
            x, z = math.cos(a) * d, math.sin(a) * d - 5
            if z > 2:
                continue
            kind = "dune_grass" if self.chance(0.85) else "rock"
            self.put(kind, x, z, self.rng.randrange(4), 0.7 + self.rng.random() * 0.7)

    # ---- 区画 ----
    def frontages(self):
        """(沿う軸, 通り沿いの位置, 通りの縁, 外向き, 家の向き)"""
        ez = self.half + self.walk + (0.6 if self.rural else 0)
        ex = self.cw + (0.6 if self.rural else 1.6)
        e, w, s, n = (self.arm[d] for d in "ewsn")
        main = [u for u in (5.8, 11.8, -5.8, -11.8) if abs(u) + 2.5 <= (e if u > 0 else w)]
        out = [("x", main, ez, 1, 2)]
        if self.style == "station":
            out.append(("x", [u for u in (14.2, -14.2) if abs(u) + 2.5 <= (e if u > 0 else w)], -ez, -1, 0))
        else:
            out.append(("x", main, -ez, -1, 0))
        cross = [u for u in (8.2, 13.2) if u + 2 <= s] + [-u for u in (8.2, 13.2) if u + 2 <= n]
        out += [("z", cross, ex, 1, 3), ("z", cross, -ex, -1, 1)]
        return out

    def lots(self):
        weights = {
            "street": [("house", 45), ("house_b", 20), ("shop", 8), ("parking", 12), ("house_lo", 10), ("vacant", 5)],
            "station": [("shop", 45), ("house_b", 25), ("parking", 20), ("house", 10)],
            "rural": [("house", 30), ("house_lo", 10), ("paddy", 35), ("trees", 15), ("vacant", 10)],
            "mountain": [("house", 25), ("house_lo", 10), ("trees", 45), ("paddy", 20)],
        }.get(self.style)
        if not weights:
            return
        kinds, ws = zip(*weights)
        for axis, positions, edge, n, face in self.frontages():
            for u in positions:
                kind = self.rng.choices(kinds, ws)[0]
                getattr(self, "lot_" + ("house" if kind.startswith("house") else kind))(kind, axis, u, edge, n, face)

    def at(self, axis, u, edge, n, depth):
        """通りに沿って u、通りの縁から外へ depth の位置"""
        return (u, edge + n * depth) if axis == "x" else (edge + n * depth, u)

    def side(self, face):
        """通りと平行に置く細長い物の向き"""
        return 0 if face in (0, 2) else 1

    def lot_house(self, kind, axis, u, edge, n, face):
        scale = 1.45 if kind == "house_lo" else 1.0
        if not self.put(kind, *self.at(axis, u, edge, n, 3.6), face, scale, var=self.rng.randrange(4)):
            return
        if self.rural:
            car = self.chance(0.6)
            self.put("fence", *self.at(axis, u - 1.6, edge, n, 0.4), self.side(face), 0.9)
            if car:
                self.put("kei_car", *self.at(axis, u + 1.9, edge, n, 0.95), self.side(face) + 1, var=self.rng.randrange(5))
            else:
                self.put("fence", *self.at(axis, u + 1.6, edge, n, 0.4), self.side(face), 0.9)
        else:
            wall = self.rng.choice(["block_wall", "block_wall", "hedge"])
            for du in (-1.75, 1.75):
                self.put(wall, *self.at(axis, u + du, edge, n, 0.7), self.side(face), 0.85)
            if self.chance(0.6):
                self.put("planter", *self.at(axis, u + 0.4, edge, n, 1.25), face)
            if self.chance(0.3):
                self.put("bicycle", *self.at(axis, u - 0.5, edge, n, 1.3), self.side(face) + 1, var=self.rng.randrange(4))
        if self.chance(0.6):
            self.put("tree_round", *self.at(axis, u + self.rng.choice([-2.6, 2.6]), edge, n, 6.0), 0, 0.55 + self.rng.random() * 0.2, var=self.rng.randrange(2))

    def lot_shop(self, kind, axis, u, edge, n, face):
        if not self.put("shop", *self.at(axis, u, edge, n, 3.4), face, var=self.rng.randrange(4)):
            return
        self.put("vending", *self.at(axis, u + 2.6, edge, n, 0.8), face)
        for i in range(self.rng.randrange(1, 4)):
            self.put("bicycle", *self.at(axis, u - 2.4 + i * 0.6, edge, n, 0.9), self.side(face) + 1, var=i)
        self.put("planter", *self.at(axis, u + 1.6, edge, n, 0.4), face)

    def lot_parking(self, kind, axis, u, edge, n, face):
        a = self.at(axis, u - 2.6, edge, n, 0.2)
        b = self.at(axis, u + 2.6, edge, n, 5.6)
        cx, cz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if not self.free(cx, cz, 2.6):
            return
        self.pave("asphalt", a[0], a[1], b[0], b[1])
        for du in (-2.4, 0, 2.4):  # 区画の白線
            p, q = self.at(axis, u + du, edge, n, 1.2), self.at(axis, u + du, edge, n, 5.2)
            pad = (0.05, 0) if axis == "x" else (0, 0.05)
            self.pave("line", p[0] - pad[0], p[1] - pad[1], q[0] + pad[0], q[1] + pad[1])
        self.taken.append((cx, cz, 2.6))
        for du in (-1.2, 1.2):
            if self.chance(0.7):
                self.put("kei_car", *self.at(axis, u + du, edge, n, 3.2), face, var=self.rng.randrange(5), on_paving=True)

    def lot_paddy(self, kind, axis, u, edge, n, face):
        self.put("paddy", *self.at(axis, u, edge, n, 3.6), self.side(face), 1.0)

    def lot_trees(self, kind, axis, u, edge, n, face):
        for _ in range(6):
            x, z = self.at(axis, u + self.rng.uniform(-2.6, 2.6), edge, n, self.rng.uniform(1.5, 6))
            self.put(self.rng.choice(["tree_round", "tree_cone"]), x, z, 0, 0.7 + self.rng.random() * 0.4, var=self.rng.randrange(2))

    def lot_vacant(self, kind, axis, u, edge, n, face):
        for _ in range(7):
            x, z = self.at(axis, u + self.rng.uniform(-2.5, 2.5), edge, n, self.rng.uniform(1, 5.5))
            self.put(self.rng.choice(["shrub", "shrub", "rock"]), x, z, self.rng.randrange(4), 0.6 + self.rng.random() * 0.6)

    def ring(self):
        """町のまわりの木と低木。通りの続きには置かない"""
        if self.style == "dune":
            return
        n = {"mountain": 70, "rural": 40}.get(self.style, 28)
        for _ in range(n * 4):
            if n <= 0:
                break
            a, d = self.rng.random() * math.tau, R_LOTS + 1 + self.rng.random() * (R_RING - R_LOTS - 1)
            x, z = math.cos(a) * d, math.sin(a) * d
            if min(abs(x), abs(z)) < 3.5:
                continue
            kind = self.rng.choice(["tree_round", "tree_cone", "tree_round", "shrub"])
            if self.put(kind, x, z, 0, 0.7 + self.rng.random() * 0.5, var=self.rng.randrange(2)):
                n -= 1

    # ---- バスの道 ----
    def leg(self, end):
        """乗り場の前から通りの端まで。日本の道なので左を走る"""
        sx = SHELTER[0]
        ex, ez = end
        if ez == 0:
            return [(sx, LANE), (ex, LANE)]
        lane = 0.8 if ez > 0 else -0.8
        return [(sx, LANE), (lane, LANE), (lane, ez)]

    def through(self, a, b):
        """通り抜けるとき。端から十字の真ん中を通って別の端へ"""
        return [a, b] if a == b else [a, (0.0, 0.0), b]

    def data(self):
        return {"style": self.style, "paving": self.paving, "props": self.props, "wires": self.wires, "blocks": self.blocks}


def build(pid, reserved, ok):
    t = Town(pid, reserved, ok)
    t.streets()
    t.furniture()
    t.lots()
    t.ring()
    return t
