"""町の通りに並べる部品を Blender で作り、public/models/ に glTF で書き出す。

実行: blender -b --python scripts/blender/town_parts.py（-- bus_shelter のように名前を渡すとその部品だけ）
作りと配色は models.py と同じ。正面は Blender の -Y（three.js の +Z）。
文字の入る板（材質名が *_face・*_name・*_sign）には UV を付け、three.js 側で文字を描いた絵を貼る。
どれも特定の製品・会社・ゲームの形を写していない、作者が決めた形。
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from models import (  # noqa: E402
    GLASS, INK, LEAF, SOIL, STONE, WHITE, WOOD, WOOD_LIGHT, YAMABUKI,
    _finish, box, clear, cone, cyl, export, gable, gable_wall, join, mat,
)

CONCRETE = (0.74, 0.74, 0.72)
METAL = (0.70, 0.72, 0.74)
FRAME_GREEN = (0.22, 0.40, 0.33)
TIRE = (0.15, 0.15, 0.17)
GLOW = (1.0, 0.95, 0.76)


def plate(name, w, h, loc, material, back=False):
    """文字を貼る板。UV は左下 (0,0)・右上 (1,1)。back なら +Y を向く（裏から見ても字が裏返らない）"""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(math.pi / 2, 0, math.pi if back else 0))
    o = bpy.context.active_object
    o.scale = (w, h, 1)
    return _finish(o, name, material)


def rod(name, p1, p2, r, material, verts=6):
    """p1 から p2 への細い棒"""
    a, b = Vector(p1), Vector(p2)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return _finish(o, name, material)


def blob(name, r, loc, material, scale=(1, 1, 1)):
    """面の少ない丸。葉や石や花に使う"""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, name, material)


def blades(prefix, n, radius, height, material, seed, lean=0.35):
    """草の葉。細い三角錐を外へ傾けて束ねる"""
    out = []
    for i in range(n):
        a = i / n * math.tau + seed
        r = radius * (0.4 + 0.6 * ((i * 37 + seed * 11) % 7) / 7)
        h = height * (0.7 + 0.3 * ((i * 53) % 5) / 5)
        x, y = math.cos(a) * r, math.sin(a) * r
        out.append(cone(f"{prefix}{i}", 0.045, h, (x, y, h / 2), material, verts=3, rot=(-math.sin(a) * lean, math.cos(a) * lean, a)))
    return out


# ---- 通りの備品 ----

def build_bus_shelter():
    """乗れるバス停。屋根とベンチ、右手前に丸い標識と町の名前の札"""
    clear()
    frame = mat("shelter_frame", FRAME_GREEN)
    parts = [
        box("slab", (3.1, 1.7, 0.12), (0, 0, 0.06), mat("concrete", CONCRETE), bevel=0.03),
        box("roof", (3.3, 1.9, 0.16), (0, 0, 2.38), frame, bevel=0.05),
        box("roof_top", (3.1, 1.7, 0.06), (0, 0.02, 2.49), mat("shelter_roof", (0.88, 0.90, 0.88)), bevel=0.02),
        box("back", (2.7, 0.05, 1.4), (0, 0.62, 1.25), mat("panel_glass", (0.72, 0.86, 0.90)), bevel=0.0),
        box("side", (0.05, 1.0, 1.4), (-1.42, 0.12, 1.25), mat("panel_glass", (0.72, 0.86, 0.90)), bevel=0.0),
        box("seat", (2.2, 0.42, 0.08), (0.1, 0.32, 0.5), mat("wood_light", WOOD_LIGHT), bevel=0.02),
        box("seat_leg_l", (0.08, 0.35, 0.46), (-0.8, 0.32, 0.25), frame, bevel=0.0),
        box("seat_leg_r", (0.08, 0.35, 0.46), (1.0, 0.32, 0.25), frame, bevel=0.0),
        plate("fascia", 3.0, 0.3, (0, -0.965, 2.38), mat("shelter_name", WHITE)),
    ]
    for x in (-1.45, 1.45):
        for y in (-0.75, 0.68):
            parts.append(box(f"post{x}{y}", (0.09, 0.09, 2.3), (x, y, 1.2), frame, bevel=0.0))
    sx, sy = 1.95, -0.62  # 標識の柱
    parts += [
        cyl("sign_pole", 0.06, 2.9, (sx, sy, 1.45), mat("hub", METAL), verts=8),
        cyl("sign_base", 0.3, 0.12, (sx, sy, 0.06), mat("concrete", CONCRETE), verts=16),
        cyl("sign_rim", 0.5, 0.07, (sx, sy, 2.78), mat("yamabuki", YAMABUKI), rot=(math.pi / 2, 0, 0), verts=28),
        plate("sign_front", 0.9, 0.9, (sx, sy - 0.04, 2.78), mat("sign_face", WHITE)),
        plate("sign_back", 0.9, 0.9, (sx, sy + 0.04, 2.78), mat("sign_face", WHITE), back=True),
        box("name_board", (0.44, 0.05, 1.0), (sx, sy - 0.09, 1.78), mat("paper", WHITE), bevel=0.01),
        plate("name_front", 0.38, 0.94, (sx, sy - 0.118, 1.78), mat("sign_name", WHITE)),
        box("timetable", (0.42, 0.05, 0.5), (sx, sy - 0.09, 0.98), mat("timetable", (0.95, 0.94, 0.88)), bevel=0.01),
    ]
    for i in range(5):
        parts.append(box(f"tt_line{i}", (0.32, 0.055, 0.025), (sx, sy - 0.1, 1.12 - i * 0.07), mat("ink", INK), bevel=0.0))
    join(parts, "bus_shelter")
    export("bus_shelter")


def build_street_lamp():
    """街灯。腕は正面（通りの側）へ出る"""
    clear()
    pole = mat("lamp_pole", (0.56, 0.60, 0.62))
    parts = [
        cyl("base", 0.17, 0.25, (0, 0, 0.12), mat("concrete", CONCRETE), verts=12),
        cyl("pole", 0.07, 4.3, (0, 0, 2.3), pole, verts=10),
        rod("arm", (0, 0, 4.3), (0, -0.85, 4.45), 0.05, pole),
        box("head", (0.34, 0.55, 0.14), (0, -0.95, 4.42), pole, bevel=0.05),
        box("glow", (0.26, 0.42, 0.05), (0, -0.95, 4.33), mat("lamp_glow", GLOW), bevel=0.01),
    ]
    join(parts, "street_lamp")
    export("street_lamp")


def build_curve_mirror():
    """交差点のカーブミラー"""
    clear()
    orange = mat("mirror_pole", (0.93, 0.47, 0.16))
    tilt = math.pi / 2 + 0.22
    parts = [
        cyl("base", 0.14, 0.15, (0, 0, 0.07), mat("concrete", CONCRETE), verts=10),
        cyl("pole", 0.05, 2.7, (0, 0, 1.35), orange, verts=8),
        cyl("ring", 0.44, 0.08, (0, -0.06, 2.75), orange, rot=(tilt, 0, 0), verts=24),
        cyl("face", 0.37, 0.09, (0, -0.075, 2.75), mat("mirror_face", (0.80, 0.88, 0.93)), rot=(tilt, 0, 0), verts=24),
        box("hood", (0.9, 0.16, 0.06), (0, -0.1, 3.2), orange, bevel=0.02),
    ]
    join(parts, "curve_mirror")
    export("curve_mirror")


def build_guide_board():
    """町の案内板。絵は three.js で描く"""
    clear()
    leg = mat("board_leg", (0.30, 0.25, 0.20))
    parts = [
        box("leg_l", (0.09, 0.09, 1.7), (-0.78, 0, 0.85), leg, bevel=0.01),
        box("leg_r", (0.09, 0.09, 1.7), (0.78, 0, 0.85), leg, bevel=0.01),
        box("frame", (1.76, 0.08, 1.14), (0, 0, 1.32), mat("board_frame", (0.33, 0.40, 0.33)), bevel=0.03),
        box("roof", (1.95, 0.4, 0.08), (0, 0, 1.96), mat("board_frame", (0.33, 0.40, 0.33)), bevel=0.02),
        plate("face", 1.6, 1.0, (0, -0.045, 1.32), mat("board_face", WHITE)),
    ]
    join(parts, "guide_board")
    export("guide_board")


def build_block_wall():
    """ブロック塀。長さは X 方向に 2.2"""
    clear()
    parts = [
        box("wall", (2.2, 0.2, 1.1), (0, 0, 0.55), mat("block", (0.80, 0.79, 0.75)), bevel=0.015),
        box("cap", (2.24, 0.26, 0.07), (0, 0, 1.13), mat("block_cap", (0.66, 0.65, 0.62)), bevel=0.02),
    ]
    for i, z in enumerate((0.2, 0.4, 0.6, 0.8)):
        parts.append(box(f"joint{i}", (2.21, 0.21, 0.025), (0, 0, z), mat("block_joint", (0.64, 0.63, 0.60)), bevel=0.0))
        for j in range(4):
            x = -0.825 + j * 0.55 + (0.275 if i % 2 else 0)
            if abs(x) < 1.05:
                parts.append(box(f"v{i}{j}", (0.025, 0.21, 0.2), (x, 0, z + 0.1), mat("block_joint", (0.64, 0.63, 0.60)), bevel=0.0))
    join(parts, "block_wall")
    export("block_wall")


def build_hedge():
    """生け垣"""
    clear()
    parts = [box("hedge", (2.2, 0.7, 0.95), (0, 0, 0.48), mat("hedge", (0.29, 0.50, 0.26)), bevel=0.22)]
    for i, x in enumerate((-0.75, 0, 0.75)):
        parts.append(blob(f"lump{i}", 0.38, (x, 0, 0.92), mat("hedge_light", (0.37, 0.59, 0.30)), scale=(1.15, 0.9, 0.55)))
    join(parts, "hedge")
    export("hedge")


def build_guardrail():
    """白いガードレール。長さ 2.4"""
    clear()
    white = mat("rail", (0.93, 0.93, 0.91))
    parts = [box("beam", (2.4, 0.07, 0.32), (0, -0.06, 0.62), white, bevel=0.03)]
    for x in (-1.05, 1.05):
        parts.append(cyl(f"post{x}", 0.05, 0.8, (x, 0.02, 0.4), mat("rail_post", (0.82, 0.83, 0.84)), verts=8))
    join(parts, "guardrail")
    export("guardrail")


def build_bicycle():
    """前かごの付いた自転車。長さは正面の向きに 1.6。フレームの色は three.js で変える"""
    clear()
    frame = mat("bike_frame", WHITE)
    rear, front = (0, 0.56, 0.34), (0, -0.56, 0.34)
    crank, seat, head = (0, 0.06, 0.3), (0, 0.22, 0.8), (0, -0.4, 0.84)
    parts = []
    for name, c in (("rear", rear), ("front", front)):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.31, minor_radius=0.035, major_segments=20, minor_segments=6,
                                         location=c, rotation=(0, math.pi / 2, 0))
        parts.append(_finish(bpy.context.active_object, f"wheel_{name}", mat("tire", TIRE)))
    for i, (a, b) in enumerate(((rear, crank), (crank, seat), (seat, rear), (crank, head), (seat, head), (head, front))):
        parts.append(rod(f"tube{i}", a, b, 0.028, frame))
    parts += [
        box("saddle", (0.14, 0.26, 0.06), (0, 0.24, 0.86), mat("ink", INK), bevel=0.02),
        rod("bar", (-0.26, -0.44, 0.98), (0.26, -0.44, 0.98), 0.022, mat("hub", METAL)),
        rod("stem", head, (0, -0.44, 0.98), 0.022, mat("hub", METAL)),
        box("basket", (0.34, 0.26, 0.2), (0, -0.66, 0.86), mat("hub", METAL), bevel=0.02),
        rod("stand", rear, (0.18, 0.62, 0.0), 0.015, mat("hub", METAL)),
    ]
    join(parts, "bicycle")
    export("bicycle")


def build_kei_car():
    """背の高い四角い軽自動車。正面は -Y。車体の色は three.js で変える"""
    clear()
    body = mat("car_body", WHITE)
    glass = mat("car_glass", (0.27, 0.35, 0.44))
    trim = mat("car_trim", (0.24, 0.24, 0.26))
    parts = [
        box("lower", (1.48, 3.3, 0.72), (0, 0, 0.6), body, bevel=0.12),
        box("cabin", (1.40, 2.35, 0.78), (0, 0.38, 1.32), body, bevel=0.14),
        box("side_glass", (1.42, 1.95, 0.42), (0, 0.42, 1.4), glass, bevel=0.04),
        box("windshield", (1.24, 0.06, 0.56), (0, -0.82, 1.34), glass, bevel=0.02, rot=(-0.38, 0, 0)),
        box("rear_glass", (1.2, 0.05, 0.44), (0, 1.56, 1.42), glass, bevel=0.02),
        box("bumper_f", (1.5, 0.16, 0.2), (0, -1.65, 0.36), trim, bevel=0.05),
        box("bumper_r", (1.5, 0.16, 0.2), (0, 1.65, 0.36), trim, bevel=0.05),
        box("grille", (0.7, 0.05, 0.16), (0, -1.66, 0.66), trim, bevel=0.02),
        box("plate", (0.38, 0.04, 0.2), (0, -1.74, 0.42), mat("plate_yellow", (0.98, 0.88, 0.40)), bevel=0.01),
    ]
    for x in (-0.48, 0.48):
        parts.append(box(f"light{x}", (0.3, 0.05, 0.16), (x, -1.66, 0.78), mat("lamp_glow", GLOW), bevel=0.02))
        parts.append(box(f"tail{x}", (0.18, 0.05, 0.3), (x * 1.3, 1.66, 0.82), mat("tail_lamp", (0.80, 0.20, 0.18)), bevel=0.02))
    for x in (-0.66, 0.66):
        for y in (-1.05, 1.05):
            parts.append(cyl(f"tire{x}{y}", 0.3, 0.22, (x, y, 0.3), mat("tire", TIRE), rot=(0, math.pi / 2, 0), verts=14))
            parts.append(cyl(f"hub{x}{y}", 0.15, 0.24, (x, y, 0.3), mat("hub", METAL), rot=(0, math.pi / 2, 0), verts=10))
    join(parts, "kei_car")
    export("kei_car")


def build_planter():
    clear()
    parts = [
        box("pot", (0.7, 0.7, 0.42), (0, 0, 0.21), mat("planter", (0.70, 0.42, 0.28)), bevel=0.05),
        box("soil", (0.6, 0.6, 0.05), (0, 0, 0.42), mat("soil", SOIL), bevel=0.0),
        blob("leaves", 0.36, (0, 0, 0.68), mat("leaf", LEAF), scale=(1, 1, 0.8)),
    ]
    for i, (x, y, c) in enumerate(((0.18, -0.2, (0.95, 0.40, 0.45)), (-0.2, -0.12, WHITE), (0.05, 0.2, (0.98, 0.82, 0.30)))):
        parts.append(blob(f"flower{i}", 0.09, (x, y, 0.92), mat(f"petal{i}", c)))
    join(parts, "planter")
    export("planter")


def build_shrub():
    clear()
    parts = [
        blob("a", 0.55, (0, 0, 0.38), mat("shrub", (0.34, 0.56, 0.29)), scale=(1, 1, 0.75)),
        blob("b", 0.38, (0.32, -0.15, 0.5), mat("shrub_light", (0.44, 0.65, 0.33)), scale=(1, 1, 0.8)),
    ]
    join(parts, "shrub")
    export("shrub")


def build_rock():
    clear()
    parts = [
        blob("a", 0.5, (0, 0, 0.18), mat("rock", (0.62, 0.60, 0.56)), scale=(1.2, 0.9, 0.62)),
        blob("b", 0.3, (0.35, 0.18, 0.12), mat("rock_dark", (0.52, 0.50, 0.47)), scale=(1, 0.9, 0.7)),
    ]
    join(parts, "rock")
    export("rock")


def build_paddy():
    """稲を刈ったあとの田んぼ。畦で囲み、奥にはざ掛け"""
    clear()
    rim = mat("paddy_rim", (0.47, 0.62, 0.32))
    parts = [box("mud", (6.0, 6.0, 0.16), (0, 0, 0.08), mat("paddy_soil", (0.56, 0.45, 0.31)), bevel=0.0)]
    for name, size, loc in (("n", (6.0, 0.4, 0.3), (0, 2.8, 0.15)), ("s", (6.0, 0.4, 0.3), (0, -2.8, 0.15)),
                            ("e", (0.4, 6.0, 0.3), (2.8, 0, 0.15)), ("w", (0.4, 6.0, 0.3), (-2.8, 0, 0.15))):
        parts.append(box(f"rim_{name}", size, loc, rim, bevel=0.08))
    for i in range(9):
        parts.append(box(f"row{i}", (5.0, 0.1, 0.1), (0, -2.2 + i * 0.5, 0.2), mat("stubble", (0.80, 0.70, 0.42)), bevel=0.0))
    for x in (-1.9, 1.9):
        parts.append(rod(f"haza_post{x}", (x, 2.2, 0), (x, 2.2, 1.45), 0.05, mat("wood", WOOD)))
    parts += [
        rod("haza_rail", (-2.1, 2.2, 1.25), (2.1, 2.2, 1.25), 0.04, mat("wood", WOOD)),
        box("hay", (3.6, 0.32, 0.62), (0, 2.2, 0.95), mat("hay", (0.86, 0.74, 0.40)), bevel=0.08),
    ]
    join(parts, "paddy")
    export("paddy")


# ---- 砂丘 ----

def build_dune_grass():
    clear()
    parts = blades("g", 7, 0.22, 0.6, mat("dune_grass", (0.55, 0.62, 0.35)), seed=1)
    parts += blades("d", 4, 0.16, 0.45, mat("dune_grass_dry", (0.80, 0.72, 0.48)), seed=2)
    join(parts, "dune_grass")
    export("dune_grass")


def build_dune_fence():
    """砂の飛ぶのを抑える竹の柵。長さ 2.4"""
    clear()
    slat = mat("fence_slat", (0.74, 0.64, 0.46))
    parts = [cyl(f"post{x}", 0.05, 1.05, (x, 0, 0.52), mat("wood", WOOD), verts=8) for x in (-1.15, 1.15)]
    for z in (0.3, 0.75):
        parts.append(box(f"rail{z}", (2.4, 0.05, 0.05), (0, 0.03, z), mat("wood", WOOD), bevel=0.0))
    for i in range(11):
        h = 0.8 + ((i * 7) % 3) * 0.06
        parts.append(box(f"slat{i}", (0.07, 0.03, h), (-1.0 + i * 0.2, -0.01, h / 2 + 0.05), slat, bevel=0.0))
    join(parts, "dune_fence")
    export("dune_fence")


def build_lookout():
    """木の展望台。正面（-Y）に階段"""
    clear()
    wood = mat("deck", WOOD_LIGHT)
    dark = mat("wood", WOOD)
    parts = [box("deck", (4.2, 3.2, 0.16), (0, 0.3, 1.45), wood, bevel=0.03)]
    for x in (-1.95, 1.95):
        for y in (-1.15, 1.75):
            parts.append(box(f"leg{x}{y}", (0.16, 0.16, 1.45), (x, y, 0.72), dark, bevel=0.02))
    for x in (-2.0, 2.0):  # 横と奥の手すり
        parts.append(box(f"rail_side{x}", (0.07, 3.2, 0.07), (x, 0.3, 2.45), dark, bevel=0.01))
        for y in (-1.2, -0.1, 1.0, 1.8):
            parts.append(box(f"rp{x}{y}", (0.07, 0.07, 1.0), (x, y, 1.95), dark, bevel=0.0))
    parts.append(box("rail_back", (4.07, 0.07, 0.07), (0, 1.86, 2.45), dark, bevel=0.01))
    for x in (-1.0, 0, 1.0):
        parts.append(box(f"rbp{x}", (0.07, 0.07, 1.0), (x, 1.86, 1.95), dark, bevel=0.0))
    for x in (-2.0, 2.0):  # 前は階段の左右だけ
        parts.append(box(f"rail_front{x}", (1.4, 0.07, 0.07), (x * 0.66, -1.24, 2.45), dark, bevel=0.01))
    for i in range(5):
        parts.append(box(f"step{i}", (1.2, 0.42, 0.1), (0, -1.45 - i * 0.38, 1.3 - i * 0.29), wood, bevel=0.02))
    parts += [
        rod("stair_l", (-0.65, -1.3, 1.4), (-0.65, -3.2, 0.0), 0.06, dark),
        rod("stair_r", (0.65, -1.3, 1.4), (0.65, -3.2, 0.0), 0.06, dark),
    ]
    join(parts, "lookout")
    export("lookout")


# ---- 駅前 ----

def build_station():
    """駅舎。どこかの駅を写したものではない、平屋の駅。名前の板は three.js で描く"""
    clear()
    wall = mat("station_wall", (0.93, 0.91, 0.86))
    roof = mat("station_roof", (0.36, 0.40, 0.47))
    parts = [
        box("base", (14.4, 6.4, 0.3), (0, 0, 0.15), mat("stone", STONE), bevel=0.05),
        box("hall", (14.0, 6.0, 4.2), (0, 0, 2.4), wall, bevel=0.08),
        gable_wall("gable", 14.0, 6.0, 4.5, 1.5, wall),
        gable("roof", 15.0, 7.2, 1.7, 4.45, roof, thick=0.22),
        box("ridge", (15.1, 0.35, 0.25), (0, 0, 6.3), mat("station_ridge", (0.27, 0.30, 0.36)), bevel=0.05),
        box("canopy", (12.0, 2.6, 0.2), (0, -4.25, 3.2), mat("canopy", (0.86, 0.87, 0.87)), bevel=0.05),
        box("canopy_edge", (12.1, 0.12, 0.3), (0, -5.5, 3.15), roof, bevel=0.03),
        box("doors", (5.0, 0.08, 2.4), (0, -3.03, 1.5), mat("glass", GLASS), bevel=0.02),
        box("door_frame", (5.2, 0.06, 0.12), (0, -3.06, 2.74), mat("hub", METAL), bevel=0.0),
        box("sign_board", (4.4, 0.1, 0.84), (-3.6, -3.06, 3.9), mat("paper", WHITE), bevel=0.03),
        plate("sign", 4.2, 0.7, (-3.6, -3.115, 3.9), mat("station_sign", WHITE)),
        cyl("clock_ring", 0.48, 0.08, (3.4, -3.06, 3.9), mat("ink", INK), rot=(math.pi / 2, 0, 0), verts=24),
        cyl("clock_face", 0.42, 0.09, (3.4, -3.07, 3.9), mat("paper", WHITE), rot=(math.pi / 2, 0, 0), verts=24),
        box("hand_h", (0.05, 0.03, 0.26), (3.4, -3.12, 3.98), mat("ink", INK), bevel=0.0),
        box("hand_m", (0.32, 0.03, 0.04), (3.52, -3.12, 3.9), mat("ink", INK), bevel=0.0),
    ]
    for x in (-5.2, 5.2):
        parts.append(box(f"win{x}", (2.6, 0.08, 1.4), (x, -3.03, 1.9), mat("glass", GLASS), bevel=0.02))
        parts.append(box(f"sill{x}", (2.8, 0.14, 0.1), (x, -3.07, 1.15), mat("wood", WOOD), bevel=0.01))
    for x in (-5.2, -1.8, 1.8, 5.2):
        parts.append(cyl(f"col{x}", 0.11, 3.1, (x, -5.3, 1.6), mat("hub", METAL), verts=10))
    join(parts, "station")
    export("station")


# ---- 足もとに散らす草花（主人公のまわりに出す） ----

def build_grass_tuft():
    clear()
    join(blades("g", 6, 0.16, 0.42, mat("grass_blade", (0.45, 0.68, 0.32)), seed=3, lean=0.4), "grass_tuft")
    export("grass_tuft")


def build_flower_tuft():
    clear()
    parts = blades("g", 5, 0.14, 0.34, mat("grass_blade", (0.45, 0.68, 0.32)), seed=5, lean=0.4)
    for i, (x, y, c) in enumerate(((0.08, -0.05, WHITE), (-0.1, 0.06, (0.98, 0.84, 0.32)), (0.02, 0.12, (0.72, 0.58, 0.90)))):
        parts.append(blob(f"f{i}", 0.06, (x, y, 0.38 + i * 0.04), mat(f"petal{i}", c)))
    join(parts, "flower_tuft")
    export("flower_tuft")


BUILDS = (
    build_bus_shelter, build_street_lamp, build_curve_mirror, build_guide_board, build_block_wall, build_hedge,
    build_guardrail, build_bicycle, build_kei_car, build_planter, build_shrub, build_rock, build_paddy,
    build_dune_grass, build_dune_fence, build_lookout, build_station, build_grass_tuft, build_flower_tuft,
)

only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for build in BUILDS:
    if not only or build.__name__.removeprefix("build_") in only:
        build()
print("done")
