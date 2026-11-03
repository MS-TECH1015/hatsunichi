"""Blender で町の模型を作り、public/models/ に glTF で書き出す。

実行: blender -b --python scripts/blender/models.py
作り: 角を丸めたおもちゃの箱庭。住民は二頭身。屋根は山陰の赤瓦といぶし瓦。
配色: 地は草の緑と漆喰の生成り。差し色は山吹の1色で、主人公のかばん・停留所の標識・画面の印だけに使う。
向き: 正面は Blender の -Y。glTF では +Z になり、three.js のカメラ側を向く。単位はメートル。
2026-11-03 に作り直した。特定のゲームの絵や形は写していない。
"""
import math
import os

import bmesh
import bpy

OUT = os.path.join(os.getcwd(), "public", "models")
os.makedirs(OUT, exist_ok=True)

CREAM = (0.96, 0.93, 0.86)
WOOD = (0.32, 0.21, 0.14)
WOOD_LIGHT = (0.62, 0.45, 0.30)
AKAGAWARA = (0.62, 0.22, 0.15)
IBUSHI = (0.30, 0.34, 0.42)
STONE = (0.66, 0.64, 0.60)
GLASS = (0.62, 0.80, 0.90)
LEAF = (0.45, 0.68, 0.33)
LEAF_DARK = (0.33, 0.55, 0.27)
SOIL = (0.50, 0.36, 0.24)
SAND = (0.91, 0.84, 0.66)
SKIN = (0.98, 0.84, 0.72)
HAIR = (0.20, 0.14, 0.11)
INK = (0.08, 0.07, 0.07)
YAMABUKI = (1.0, 0.76, 0.16)
AI = (0.17, 0.27, 0.50)
WHITE = (0.98, 0.98, 0.96)
PINK = (0.96, 0.62, 0.62)

_materials = {}


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    _materials.clear()


def mat(name, rgb):
    """同じ名前の材質は1つにまとめる。three.js 側は名前で色を差し替える"""
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    _materials[name] = m
    return m


def _finish(o, name, material, bevel=0.0, smooth=False):
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        bpy.ops.object.shade_smooth()
    return o


def box(name, size, loc, material, bevel=0.04, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    return _finish(o, name, material, bevel)


def ball(name, radius, loc, material, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=radius, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, name, material, smooth=True)


def cyl(name, radius, depth, loc, material, rot=(0, 0, 0), verts=16, smooth=True, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    _finish(o, name, material, bevel)
    if smooth:
        bpy.ops.object.shade_smooth()
    return o


def cone(name, r1, depth, loc, material, verts=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=0, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, name, material)


def mesh(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    o.data.materials.append(material)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return o


def gable(name, width, depth, height, z0, material, cx=0.0, cy=0.0, thick=0.18):
    """切妻屋根。棟は X 方向。厚みを持たせて軒先が見えるようにする"""
    w, d = width / 2, depth / 2
    v = [
        (cx - w, cy - d, z0), (cx + w, cy - d, z0), (cx + w, cy + d, z0), (cx - w, cy + d, z0),
        (cx - w, cy, z0 + height), (cx + w, cy, z0 + height),
        (cx - w, cy - d, z0 + thick), (cx + w, cy - d, z0 + thick), (cx + w, cy + d, z0 + thick), (cx - w, cy + d, z0 + thick),
        (cx - w, cy, z0 + height + thick), (cx + w, cy, z0 + height + thick),
    ]
    f = [(6, 7, 11, 10), (9, 8, 11, 10), (0, 1, 5, 4), (3, 2, 5, 4), (0, 1, 7, 6), (3, 2, 8, 9), (0, 4, 10, 6), (3, 4, 10, 9), (1, 5, 11, 7), (2, 5, 11, 8)]
    return mesh(name, v, f, material)


def gable_wall(name, width, depth, z0, height, material):
    """屋根の下の三角の壁。これが無いと横から屋根の裏が透けて見える"""
    w, d = width / 2, depth / 2
    v = [(-w, -d, z0), (w, -d, z0), (w, d, z0), (-w, d, z0), (-w, 0, z0 + height), (w, 0, z0 + height)]
    f = [(0, 1, 2, 3), (0, 1, 5, 4), (3, 2, 5, 4), (0, 4, 3), (1, 5, 2)]
    return mesh(name, v, f, material)


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True)
    print("exported", path)


def window(name, x, z, y_front, w=0.8, h=0.7):
    frame = box(name + "_f", (w + 0.12, 0.06, h + 0.12), (x, y_front - 0.02, z), mat("wood", WOOD), bevel=0.02)
    glass = box(name + "_g", (w, 0.08, h), (x, y_front - 0.04, z), mat("glass", GLASS), bevel=0.01)
    bar = box(name + "_b", (0.05, 0.1, h), (x, y_front - 0.05, z), mat("wood", WOOD), bevel=0.0)
    return [frame, glass, bar]


# ---- 建物 ----

def house_parts(roof_rgb, wall_rgb=CREAM, roof_name="roof", wall_name="wall"):
    parts = [
        box("base", (4.3, 3.7, 0.3), (0, 0, 0.15), mat("stone", STONE), bevel=0.05),
        box("wall", (4.0, 3.4, 2.4), (0, 0, 1.5), mat(wall_name, wall_rgb), bevel=0.06),
        box("koshi", (4.06, 3.46, 0.75), (0, 0, 0.68), mat("wood", WOOD), bevel=0.04),
        gable_wall("gable", 4.0, 3.4, 2.7, 1.3, mat(wall_name, wall_rgb)),
        gable("roof", 4.9, 4.3, 1.5, 2.65, mat(roof_name, roof_rgb)),
        box("ridge", (5.0, 0.3, 0.22), (0, 0, 4.25), mat(roof_name + "_ridge", tuple(c * 0.75 for c in roof_rgb)), bevel=0.05),
        box("door", (0.95, 0.1, 1.7), (0.95, -1.72, 1.15), mat("wood", WOOD), bevel=0.03),
        box("step", (1.3, 0.5, 0.18), (0.95, -2.05, 0.09), mat("stone", STONE), bevel=0.03),
    ]
    parts += window("w1", -0.9, 1.95, -1.7)
    return parts


def build_houses():
    for name, roof in (("house", AKAGAWARA), ("house_b", IBUSHI)):
        clear()
        join(house_parts(roof), name)
        export(name)


def build_shop():
    for name, open_ in (("shop", True), ("shop_closed", False)):
        clear()
        parts = house_parts(AKAGAWARA)
        parts.append(box("eave", (4.4, 1.3, 0.12), (0, -2.2, 2.55), mat("wood_light", WOOD_LIGHT), bevel=0.03, rot=(0.25, 0, 0)))
        if open_:
            for i in range(5):
                parts.append(box(f"noren{i}", (0.62, 0.04, 0.8), (-1.4 + i * 0.7, -2.0, 2.0), mat("ai", AI), bevel=0.01))
            parts.append(box("table", (2.6, 0.9, 0.7), (-0.8, -2.5, 0.35), mat("wood_light", WOOD_LIGHT), bevel=0.04))
            colors = [("tomato", (0.86, 0.22, 0.16)), ("cabbage", (0.55, 0.78, 0.35)), ("nashi", (0.92, 0.84, 0.45))]
            for i in range(9):
                name_c, rgb = colors[i % 3]
                parts.append(ball(f"veg{i}", 0.17, (-1.8 + (i % 9) * 0.25, -2.5 + (i % 2) * 0.25, 0.85), mat(name_c, rgb)))
        else:
            parts.append(box("shutter", (3.4, 0.08, 2.0), (0, -1.76, 1.3), mat("shutter", (0.62, 0.64, 0.66)), bevel=0.01))
            for i in range(8):
                parts.append(box(f"line{i}", (3.4, 0.1, 0.03), (0, -1.78, 0.45 + i * 0.24), mat("shutter_line", (0.5, 0.52, 0.55)), bevel=0.0))
            parts.append(box("paper", (0.5, 0.11, 0.65), (0.6, -1.8, 1.6), mat("paper", WHITE), bevel=0.0))
        join(parts, name)
        export(name)


def build_empty_house():
    clear()
    dull_wall = (0.76, 0.73, 0.66)
    parts = [
        box("base", (4.3, 3.7, 0.3), (0, 0, 0.15), mat("stone", STONE), bevel=0.05),
        box("wall", (4.0, 3.4, 2.4), (0, 0, 1.5), mat("empty_wall", dull_wall), bevel=0.06),
        box("koshi", (4.06, 3.46, 0.75), (0, 0, 0.68), mat("empty_wood", (0.38, 0.32, 0.27)), bevel=0.04),
        gable_wall("gable", 4.0, 3.4, 2.7, 1.3, mat("empty_wall", dull_wall)),
        gable("roof", 4.9, 4.3, 1.5, 2.65, mat("empty_roof", (0.45, 0.30, 0.26))),
        box("hole", (0.9, 0.2, 0.5), (1.1, -1.1, 3.4), mat("hole", INK), bevel=0.02, rot=(0.6, 0, 0)),
        box("door", (0.95, 0.1, 1.7), (0.95, -1.72, 1.15), mat("empty_wood", (0.38, 0.32, 0.27)), bevel=0.03),
    ]
    parts += window("w1", -0.9, 1.95, -1.7)
    parts.append(box("plank1", (1.2, 0.08, 0.14), (-0.9, -1.8, 1.95), mat("plank", WOOD_LIGHT), bevel=0.01, rot=(0, 0.6, 0)))
    parts.append(box("plank2", (1.2, 0.08, 0.14), (-0.9, -1.82, 1.95), mat("plank", WOOD_LIGHT), bevel=0.01, rot=(0, -0.6, 0)))
    for i, (x, y, s) in enumerate(((2.3, -1.6, 0.7), (1.8, -2.1, 0.5), (-2.4, -1.4, 0.6), (-1.9, -2.0, 0.45), (2.5, 1.0, 0.6))):
        parts.append(cone(f"weed{i}", 0.35 * s + 0.1, s, (x, y, s / 2), mat("weed", (0.52, 0.62, 0.30)), verts=6))
    join(parts, "empty_house")
    export("empty_house")


def build_school():
    clear()
    parts = [
        box("base", (12.4, 4.6, 0.3), (0, 0, 0.15), mat("stone", STONE), bevel=0.05),
        box("body", (12, 4.2, 5.6), (0, 0, 3.1), mat("wall", CREAM), bevel=0.08),
        box("roof", (12.4, 4.6, 0.35), (0, 0, 6.05), mat("roof_ibushi", IBUSHI), bevel=0.06),
        box("tower", (2.4, 2.2, 1.6), (0, 0, 7.0), mat("wall", CREAM), bevel=0.06),
        box("tower_roof", (2.7, 2.5, 0.3), (0, 0, 7.95), mat("roof_ibushi", IBUSHI), bevel=0.05),
        cyl("clock", 0.6, 0.1, (0, -1.12, 7.0), mat("clock", WHITE), rot=(math.pi / 2, 0, 0), verts=24),
        box("hand1", (0.06, 0.04, 0.45), (0, -1.2, 7.15), mat("ink", INK), bevel=0.0),
        box("hand2", (0.35, 0.04, 0.06), (0.15, -1.2, 7.0), mat("ink", INK), bevel=0.0),
        box("canopy", (3, 1.4, 0.2), (0, -2.6, 2.5), mat("roof_ibushi", IBUSHI), bevel=0.04),
        box("door", (1.8, 0.1, 2.2), (0, -2.12, 1.4), mat("glass", GLASS), bevel=0.02),
    ]
    for row, z in enumerate((2.0, 4.4)):
        for i in range(6):
            x = -5 + i * 2
            if row == 0 and abs(x) < 1.5:
                continue
            parts += window(f"w{row}{i}", x, z, -2.1, w=1.2, h=1.0)
    join(parts, "school")
    export("school")


def build_workshop():
    """町工場。鋸屋根を3つ並べる"""
    clear()
    wall = mat("ws_wall", (0.72, 0.78, 0.82))
    roof = mat("ws_roof", (0.40, 0.44, 0.50))
    parts = [
        box("base", (8.4, 6.4, 0.3), (0, 0, 0.15), mat("stone", STONE), bevel=0.05),
        box("body", (8, 6, 3.6), (0, 0, 2.1), wall, bevel=0.06),
    ]
    for i in range(3):
        x0 = -4 + i * (8 / 3)
        x1 = x0 + 8 / 3
        v = [(x0, -3.1, 3.9), (x1, -3.1, 3.9), (x1, 3.1, 3.9), (x0, 3.1, 3.9), (x1, -3.1, 5.2), (x1, 3.1, 5.2)]
        f = [(0, 1, 4), (3, 2, 5), (0, 4, 5, 3), (1, 2, 5, 4), (0, 3, 2, 1)]
        parts.append(mesh(f"saw{i}", v, f, roof))
        parts.append(box(f"sawglass{i}", (0.06, 6.0, 1.1), (x1 - 0.05, 0, 4.5), mat("glass", GLASS), bevel=0.0))
    parts += [
        box("door", (2.6, 0.12, 2.8), (-1.6, -3.02, 1.7), mat("ws_door", (0.55, 0.60, 0.66)), bevel=0.02),
        cyl("chimney", 0.3, 3.0, (3.0, 2.0, 6.0), mat("ws_roof", (0.40, 0.44, 0.50)), verts=12),
        box("pallet", (1.2, 1.0, 0.25), (2.4, -3.8, 0.13), mat("wood_light", WOOD_LIGHT), bevel=0.02),
        box("crate", (0.9, 0.8, 0.7), (2.4, -3.8, 0.6), mat("wood_light", WOOD_LIGHT), bevel=0.04),
    ]
    parts += window("w1", 1.6, 2.2, -3.0, w=1.6, h=1.0)
    join(parts, "workshop")
    export("workshop")


# ---- 自然と畑 ----

def build_trees():
    clear()
    parts = [cyl("trunk", 0.2, 1.6, (0, 0, 0.8), mat("trunk", WOOD), verts=8)]
    for i, (x, y, z, r) in enumerate(((0, 0, 2.2, 1.1), (0.55, -0.2, 1.8, 0.8), (-0.5, 0.25, 1.9, 0.85), (0.1, 0.1, 2.9, 0.75))):
        parts.append(ball(f"leaf{i}", r, (x, y, z), mat("leaf", LEAF) if i % 2 == 0 else mat("leaf_dark", LEAF_DARK)))
    join(parts, "tree")
    export("tree")


def build_pear_trellis():
    """二十世紀梨の梨棚。低い棚に枝を広げ、実が下がる"""
    clear()
    parts = []
    for i, (x, y) in enumerate(((-1.6, -1.6), (1.6, -1.6), (1.6, 1.6), (-1.6, 1.6))):
        parts.append(cyl(f"pole{i}", 0.06, 2.0, (x, y, 1.0), mat("pole", WOOD_LIGHT), verts=6, smooth=False))
    parts.append(cyl("trunk", 0.16, 1.8, (0, 0, 0.9), mat("trunk", WOOD), verts=8))
    for i, (x, y) in enumerate(((-0.9, -0.8), (0.9, -0.7), (0.8, 0.9), (-0.8, 0.8), (0, 0))):
        parts.append(ball(f"canopy{i}", 1.1, (x, y, 2.1), mat("leaf", LEAF) if i % 2 else mat("leaf_dark", LEAF_DARK), scale=(1, 1, 0.38)))
    for i, (x, y) in enumerate(((-1.2, -1.0), (-0.3, -1.3), (0.7, -1.1), (1.3, -0.2), (0.4, 0.6), (-0.9, 0.5), (1.0, 1.1), (-0.2, 1.2))):
        parts.append(ball(f"nashi{i}", 0.16, (x, y, 1.62), mat("nashi", (0.92, 0.84, 0.45))))
    join(parts, "pear_tree")
    export("pear_tree")


def build_field():
    clear()
    parts = [box("ground", (8, 6, 0.25), (0, 0, 0.12), mat("soil", SOIL), bevel=0.08)]
    for i in range(5):
        y = -2.4 + i * 1.2
        parts.append(box(f"ridge{i}", (7.4, 0.55, 0.3), (0, y, 0.35), mat("soil_ridge", (0.58, 0.42, 0.28)), bevel=0.12))
        for j in range(9):
            parts.append(cone(f"sprout{i}{j}", 0.18, 0.4, (-3.3 + j * 0.82, y, 0.7), mat("sprout", (0.50, 0.75, 0.32)), verts=5))
    # かかし
    parts += [
        cyl("kakashi_pole", 0.05, 1.8, (3.2, 3.4, 0.9), mat("pole", WOOD_LIGHT), verts=6, smooth=False),
        box("kakashi_arm", (1.2, 0.06, 0.06), (3.2, 3.4, 1.35), mat("pole", WOOD_LIGHT), bevel=0.0),
        box("kakashi_body", (0.5, 0.2, 0.55), (3.2, 3.4, 1.2), mat("ai", AI), bevel=0.05),
        ball("kakashi_head", 0.22, (3.2, 3.4, 1.7), mat("paper", WHITE)),
        cone("kakashi_hat", 0.42, 0.25, (3.2, 3.4, 1.9), mat("straw", (0.88, 0.76, 0.45)), verts=12),
    ]
    join(parts, "field")
    export("field")


def build_ginger_cave():
    """生姜穴。小山の横穴に木の枠と扉。前に生姜の木箱"""
    clear()
    parts = [
        ball("mound", 3.0, (0, 1.2, 0), mat("mound", (0.47, 0.62, 0.33)), scale=(1.3, 1.0, 0.75)),
        ball("mound_top", 1.6, (0.8, 1.8, 1.6), mat("leaf_dark", LEAF_DARK), scale=(1.2, 1.0, 0.6)),
        box("hole", (1.3, 1.2, 1.5), (0, -1.6, 0.75), mat("hole", INK), bevel=0.15),
        box("frame_l", (0.22, 0.3, 1.9), (-0.8, -2.1, 0.95), mat("wood", WOOD), bevel=0.03),
        box("frame_r", (0.22, 0.3, 1.9), (0.8, -2.1, 0.95), mat("wood", WOOD), bevel=0.03),
        box("frame_t", (2.0, 0.34, 0.26), (0, -2.1, 1.95), mat("wood", WOOD), bevel=0.03),
        box("door", (0.7, 0.08, 1.5), (-0.55, -2.35, 0.8), mat("wood_light", WOOD_LIGHT), bevel=0.02, rot=(0, 0, 0.7)),
        box("crate", (0.8, 0.6, 0.45), (1.7, -2.6, 0.23), mat("wood_light", WOOD_LIGHT), bevel=0.04),
    ]
    for i in range(5):
        parts.append(ball(f"ginger{i}", 0.13, (1.45 + (i % 3) * 0.22, -2.6 + (i // 3) * 0.2, 0.52), mat("ginger", (0.90, 0.74, 0.45)), scale=(1.4, 0.8, 0.8)))
    join(parts, "ginger_cave")
    export("ginger_cave")


def build_hill():
    """町の外側に置く山。箱庭の縁を囲む"""
    clear()
    parts = [
        ball("hill", 8, (0, 0, -1.5), mat("hill", (0.42, 0.62, 0.36)), scale=(1.4, 1.0, 0.75)),
        ball("hill2", 5, (5, 2, 1.0), mat("hill_dark", (0.34, 0.53, 0.31)), scale=(1.2, 1.0, 0.8)),
    ]
    join(parts, "hill")
    export("hill")


# ---- 町の小物 ----

def build_fence():
    clear()
    parts = []
    for i in range(3):
        parts.append(box(f"post{i}", (0.14, 0.14, 0.9), (-0.9 + i * 0.9, 0, 0.45), mat("wood_light", WOOD_LIGHT), bevel=0.03))
    for z in (0.35, 0.7):
        parts.append(box(f"rail{z}", (2.0, 0.08, 0.12), (0, 0, z), mat("wood_light", WOOD_LIGHT), bevel=0.02))
    join(parts, "fence")
    export("fence")


def build_flowers():
    clear()
    parts = [box("bed", (1.6, 0.8, 0.25), (0, 0, 0.12), mat("soil", SOIL), bevel=0.06)]
    colors = [("f_red", (0.92, 0.35, 0.35)), ("f_white", WHITE), ("f_purple", (0.62, 0.48, 0.85)), ("f_yellow", (0.98, 0.82, 0.30))]
    for i in range(10):
        x = -0.6 + (i % 5) * 0.3
        y = -0.18 + (i // 5) * 0.36
        parts.append(cyl(f"stem{i}", 0.02, 0.3, (x, y, 0.35), mat("sprout", (0.50, 0.75, 0.32)), verts=4, smooth=False))
        parts.append(ball(f"flower{i}", 0.1, (x, y, 0.52), mat(*colors[i % 4])))
    join(parts, "flowers")
    export("flowers")


def build_pole():
    """電柱"""
    clear()
    parts = [
        cyl("pole", 0.14, 7.0, (0, 0, 3.5), mat("concrete", (0.72, 0.72, 0.70)), verts=10),
        box("arm", (1.6, 0.12, 0.12), (0, 0, 6.5), mat("concrete", (0.72, 0.72, 0.70)), bevel=0.02),
        cyl("insulator1", 0.07, 0.18, (-0.6, 0, 6.65), mat("paper", WHITE), verts=8),
        cyl("insulator2", 0.07, 0.18, (0.6, 0, 6.65), mat("paper", WHITE), verts=8),
        box("plate", (0.3, 0.05, 0.6), (0, -0.16, 2.0), mat("paper", WHITE), bevel=0.01),
    ]
    join(parts, "pole")
    export("pole")


def build_vending():
    """自販機"""
    clear()
    parts = [
        box("body", (1.0, 0.75, 1.8), (0, 0, 0.9), mat("vend", (0.92, 0.92, 0.94)), bevel=0.06),
        box("panel", (0.86, 0.05, 0.9), (0, -0.38, 1.25), mat("glass", GLASS), bevel=0.01),
        box("slot", (0.6, 0.06, 0.18), (0, -0.39, 0.35), mat("ink", INK), bevel=0.02),
        box("stripe", (1.02, 0.77, 0.12), (0, 0, 1.75), mat("ai", AI), bevel=0.02),
    ]
    for i in range(8):
        parts.append(cyl(f"can{i}", 0.06, 0.18, (-0.3 + (i % 4) * 0.2, -0.42, 1.45 - (i // 4) * 0.35), mat(["can_r", "can_g", "can_y", "can_w"][i % 4], [(0.85, 0.25, 0.2), (0.4, 0.7, 0.4), (0.95, 0.8, 0.3), WHITE][i % 4]), verts=8))
    join(parts, "vending")
    export("vending")


def build_bench():
    clear()
    parts = [
        box("seat", (1.6, 0.5, 0.1), (0, 0, 0.45), mat("wood_light", WOOD_LIGHT), bevel=0.03),
        box("back", (1.6, 0.08, 0.4), (0, 0.24, 0.75), mat("wood_light", WOOD_LIGHT), bevel=0.03),
        box("leg1", (0.08, 0.45, 0.45), (-0.65, 0, 0.22), mat("wood", WOOD), bevel=0.02),
        box("leg2", (0.08, 0.45, 0.45), (0.65, 0, 0.22), mat("wood", WOOD), bevel=0.02),
    ]
    join(parts, "bench")
    export("bench")


def build_road():
    clear()
    join([box("tile", (4, 4, 0.08), (0, 0, 0.04), mat("road", SAND), bevel=0.0)], "road")
    export("road")


# ---- 乗り物と停留所 ----

def build_bus():
    clear()
    parts = [
        box("body", (7.6, 2.4, 2.5), (0, 0, 1.6), mat("bus_body", (0.97, 0.95, 0.88)), bevel=0.4),
        box("stripe", (7.65, 2.45, 0.35), (0, 0, 0.95), mat("bus_stripe", (0.30, 0.55, 0.42)), bevel=0.12),
        box("windows", (6.4, 2.46, 0.8), (-0.4, 0, 2.15), mat("bus_glass", (0.30, 0.42, 0.55)), bevel=0.1),
        box("front", (0.1, 2.0, 1.1), (3.8, 0, 2.0), mat("bus_glass", (0.30, 0.42, 0.55)), bevel=0.05),
        box("sign", (0.08, 1.2, 0.3), (3.82, 0, 2.7), mat("yamabuki", YAMABUKI), bevel=0.02),
    ]
    for i, (x, y) in enumerate(((2.4, -1.2), (2.4, 1.2), (-2.4, -1.2), (-2.4, 1.2))):
        parts.append(cyl(f"wheel{i}", 0.5, 0.35, (x, y, 0.5), mat("tire", (0.15, 0.15, 0.17)), rot=(math.pi / 2, 0, 0), verts=16))
        parts.append(cyl(f"hub{i}", 0.22, 0.38, (x, y, 0.5), mat("hub", (0.75, 0.75, 0.78)), rot=(math.pi / 2, 0, 0), verts=12))
    join(parts, "bus")
    export("bus")


def build_stop():
    clear()
    parts = [
        cyl("pole", 0.06, 2.4, (0, 0, 1.2), mat("hub", (0.75, 0.75, 0.78)), verts=8),
        cyl("base", 0.3, 0.12, (0, 0, 0.06), mat("concrete", (0.72, 0.72, 0.70)), verts=16),
        cyl("sign_ring", 0.42, 0.08, (0, 0, 2.55), mat("yamabuki", YAMABUKI), rot=(math.pi / 2, 0, 0), verts=24),
        cyl("sign_face", 0.33, 0.1, (0, 0, 2.55), mat("paper", WHITE), rot=(math.pi / 2, 0, 0), verts=24),
        box("timetable", (0.4, 0.06, 0.55), (0, -0.08, 1.5), mat("paper", WHITE), bevel=0.01),
        box("roof", (2.4, 1.2, 0.12), (1.6, 0.5, 2.3), mat("roof_ibushi", IBUSHI), bevel=0.04),
        box("post1", (0.08, 0.08, 2.2), (0.6, 0.9, 1.1), mat("hub", (0.75, 0.75, 0.78)), bevel=0.0),
        box("post2", (0.08, 0.08, 2.2), (2.6, 0.9, 1.1), mat("hub", (0.75, 0.75, 0.78)), bevel=0.0),
        box("seat", (1.6, 0.45, 0.1), (1.6, 0.6, 0.45), mat("wood_light", WOOD_LIGHT), bevel=0.03),
        box("seat_leg", (1.4, 0.3, 0.4), (1.6, 0.6, 0.2), mat("wood", WOOD), bevel=0.03),
    ]
    join(parts, "stop")
    export("stop")


# ---- 人 ----

def person_parts(body_rgb, hair_rgb=HAIR):
    """二頭身。胴の材質 person_body と髪の person_hair は three.js 側で役ごとに差し替える"""
    body = mat("person_body", body_rgb)
    return [
        cyl("leg_l", 0.09, 0.34, (-0.11, 0, 0.17), mat("person_legs", (0.25, 0.26, 0.32)), verts=10),
        cyl("leg_r", 0.09, 0.34, (0.11, 0, 0.17), mat("person_legs", (0.25, 0.26, 0.32)), verts=10),
        box("body", (0.52, 0.36, 0.5), (0, 0, 0.58), body, bevel=0.13),
        ball("arm_l", 0.1, (-0.32, 0, 0.6), body, scale=(1, 1, 1.8)),
        ball("arm_r", 0.1, (0.32, 0, 0.6), body, scale=(1, 1, 1.8)),
        ball("head", 0.36, (0, 0, 1.13), mat("skin", SKIN)),
        ball("hair", 0.38, (0, 0.07, 1.21), mat("person_hair", hair_rgb), scale=(1, 1, 0.88)),
        ball("eye_l", 0.045, (-0.12, -0.335, 1.12), mat("ink", INK)),
        ball("eye_r", 0.045, (0.12, -0.335, 1.12), mat("ink", INK)),
        ball("cheek_l", 0.05, (-0.21, -0.29, 1.03), mat("cheek", PINK), scale=(1, 0.5, 0.7)),
        ball("cheek_r", 0.05, (0.21, -0.29, 1.03), mat("cheek", PINK), scale=(1, 0.5, 0.7)),
    ]


def build_person():
    clear()
    join(person_parts((0.35, 0.45, 0.62)), "person")
    export("person")


def build_player():
    """主人公の大学生。山吹のかばんを背負う"""
    clear()
    parts = person_parts((0.25, 0.45, 0.80))
    parts.append(box("bag", (0.42, 0.22, 0.46), (0, 0.27, 0.62), mat("yamabuki", YAMABUKI), bevel=0.09))
    parts.append(box("strap_l", (0.06, 0.4, 0.06), (-0.16, 0.0, 0.82), mat("yamabuki", YAMABUKI), bevel=0.0))
    parts.append(box("strap_r", (0.06, 0.4, 0.06), (0.16, 0.0, 0.82), mat("yamabuki", YAMABUKI), bevel=0.0))
    join(parts, "player")
    export("player")


def build_rabbit():
    """因幡の白兎。案内役"""
    clear()
    fur = mat("rabbit_fur", WHITE)
    parts = [
        ball("body", 0.34, (0, 0.05, 0.32), fur, scale=(1, 1.1, 0.95)),
        ball("head", 0.27, (0, -0.2, 0.72), fur),
        ball("ear_l", 0.1, (-0.1, -0.12, 1.12), fur, scale=(0.8, 0.5, 2.6)),
        ball("ear_r", 0.1, (0.1, -0.12, 1.12), fur, scale=(0.8, 0.5, 2.6)),
        ball("inner_l", 0.06, (-0.1, -0.165, 1.12), mat("rabbit_ear", PINK), scale=(0.7, 0.4, 2.6)),
        ball("inner_r", 0.06, (0.1, -0.165, 1.12), mat("rabbit_ear", PINK), scale=(0.7, 0.4, 2.6)),
        ball("eye_l", 0.04, (-0.1, -0.43, 0.76), mat("rabbit_eye", (0.65, 0.10, 0.15))),
        ball("eye_r", 0.04, (0.1, -0.43, 0.76), mat("rabbit_eye", (0.65, 0.10, 0.15))),
        ball("nose", 0.03, (0, -0.46, 0.68), mat("cheek", PINK)),
        ball("tail", 0.1, (0, 0.42, 0.3), fur),
        cyl("scarf", 0.2, 0.08, (0, -0.15, 0.5), mat("ai", AI), verts=16),
    ]
    join(parts, "rabbit")
    export("rabbit")


for build in (
    build_houses, build_shop, build_empty_house, build_school, build_workshop,
    build_trees, build_pear_trellis, build_field, build_ginger_cave, build_hill,
    build_fence, build_flowers, build_pole, build_vending, build_bench, build_road,
    build_bus, build_stop, build_person, build_player, build_rabbit,
):
    build()
print("done")
