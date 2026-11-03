"""Blender でアプリの 3D モデルを作り、public/models/ に glTF で書き出す。

実行: blender -b --python scripts/blender/models.py
作るもの: バス、停留所の標識、家、店、空き家、畑、梨の木、生姜穴、人、白兎、学校、事業所、道。すべて低ポリで、2026-11-03 に新規に作った。
見た目の決まり: 白い漆喰と焦げ茶の腰板、差し色は朱の1色。台は砂丘の砂色。
単位はメートル。+Y が前。
"""
import math
import os
import sys

import bpy

OUT = os.path.join(os.getcwd(), "public", "models")
os.makedirs(OUT, exist_ok=True)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name, rgb, metallic=0.0, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def box(name, size, location, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.data.materials.append(mat)
    return o


def cylinder(name, radius, depth, location, rotation, mat, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=location, rotation=rotation)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


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


def build_bus():
    clear()
    body_mat = material("bus_body", (0.93, 0.93, 0.90))
    stripe_mat = material("bus_stripe", (0.85, 0.28, 0.06))
    glass_mat = material("bus_glass", (0.35, 0.55, 0.70), roughness=0.2)
    dark_mat = material("bus_dark", (0.12, 0.12, 0.13))
    parts = []
    # 車体 幅2.4 × 長さ9 × 高さ2.6。床下は少し浮かせる
    parts.append(box("body", (2.4, 9.0, 2.2), (0, 0, 1.5), body_mat))
    parts.append(box("roof", (2.2, 8.6, 0.3), (0, 0, 2.75), body_mat))
    # 帯
    parts.append(box("stripe_l", (0.02, 8.8, 0.35), (1.21, 0, 0.9), stripe_mat))
    parts.append(box("stripe_r", (0.02, 8.8, 0.35), (-1.21, 0, 0.9), stripe_mat))
    # 窓 左右と前後
    parts.append(box("win_l", (0.02, 7.6, 0.9), (1.22, -0.2, 1.95), glass_mat))
    parts.append(box("win_r", (0.02, 7.6, 0.9), (-1.22, -0.2, 1.95), glass_mat))
    parts.append(box("win_f", (2.1, 0.02, 1.1), (0, 4.51, 1.9), glass_mat))
    parts.append(box("win_b", (2.1, 0.02, 0.8), (0, -4.51, 2.0), glass_mat))
    # 扉
    parts.append(box("door", (0.02, 0.9, 1.8), (1.22, 3.0, 1.3), dark_mat))
    # 車輪 4つ
    for y in (2.8, -2.8):
        for x in (1.0, -1.0):
            parts.append(cylinder(f"wheel_{x}_{y}", 0.5, 0.35, (x, y, 0.5), (0, math.pi / 2, 0), dark_mat))
    join(parts, "bus")
    export("bus")


def build_stop():
    clear()
    pole_mat = material("stop_pole", (0.25, 0.25, 0.27), metallic=0.4, roughness=0.4)
    sign_mat = material("stop_sign", (0.21, 0.31, 0.77))
    face_mat = material("stop_face", (0.97, 0.97, 0.97))
    parts = []
    parts.append(cylinder("pole", 0.05, 2.6, (0, 0, 1.3), (0, 0, 0), pole_mat, verts=10))
    parts.append(cylinder("base", 0.3, 0.1, (0, 0, 0.05), (0, 0, 0), pole_mat, verts=16))
    # 丸い標識。縁は青、面は白
    parts.append(cylinder("sign", 0.45, 0.06, (0, 0, 2.6), (math.pi / 2, 0, 0), sign_mat, verts=24))
    parts.append(cylinder("face", 0.36, 0.08, (0, 0, 2.6), (math.pi / 2, 0, 0), face_mat, verts=24))
    join(parts, "stop")
    export("stop")


def pyramid(name, base, height, location, mat):
    """屋根。四角錐"""
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=base * 0.75, radius2=0, depth=height, location=location, rotation=(0, 0, math.pi / 4))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


def ball(name, radius, location, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=location)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


WALL = (0.95, 0.93, 0.88)
WOOD = (0.28, 0.19, 0.13)
ROOF = (0.22, 0.23, 0.27)
ACCENT = (0.85, 0.28, 0.06)
GREEN = (0.45, 0.62, 0.32)
SOIL = (0.52, 0.40, 0.28)
SKIN = (0.95, 0.85, 0.75)


def build_house():
    clear()
    wall, wood, roof = material("house_wall", WALL), material("house_wood", WOOD), material("house_roof", ROOF)
    join([
        box("body", (4, 4, 2.6), (0, 0, 1.3), wall),
        box("skirt", (4.05, 4.05, 0.9), (0, 0, 0.45), wood),
        pyramid("roof", 4.6, 1.6, (0, 0, 3.4), roof),
    ], "house")
    export("house")


def build_shop():
    """店。のれんが差し色。閉まっている店は shutter で分ける"""
    for name, open_ in (("shop", True), ("shop_closed", False)):
        clear()
        wall, wood, roof = material("shop_wall", WALL), material("shop_wood", WOOD), material("shop_roof", ROOF)
        parts = [
            box("body", (5, 4, 3), (0, 0, 1.5), wall),
            box("skirt", (5.05, 4.05, 0.8), (0, 0, 0.4), wood),
            box("eave", (5.4, 1.2, 0.15), (0, -2.4, 2.4), wood),
            pyramid("roof", 5.6, 1.4, (0, 0, 3.7), roof),
        ]
        if open_:
            parts.append(box("noren", (3, 0.05, 0.9), (0, -2.1, 1.9), material("shop_noren", ACCENT)))
        else:
            parts.append(box("shutter", (3.2, 0.08, 2.2), (0, -2.05, 1.1), material("shop_shutter", (0.55, 0.55, 0.57), metallic=0.3)))
        join(parts, name)
        export(name)


def build_empty_house():
    """空き家。壁はくすみ、屋根がずれ、雨戸が閉じ、草が生えている"""
    clear()
    wall = material("empty_wall", (0.78, 0.75, 0.68))
    wood = material("empty_wood", (0.35, 0.30, 0.25))
    roof = material("empty_roof", (0.30, 0.30, 0.32))
    weed = material("empty_weed", (0.55, 0.62, 0.35))
    join([
        box("body", (4, 4, 2.6), (0, 0, 1.3), wall),
        box("skirt", (4.05, 4.05, 0.9), (0, 0, 0.45), wood),
        box("shutter", (1.6, 0.08, 1.2), (-0.8, -2.03, 1.6), wood),
        pyramid("roof", 4.6, 1.6, (0.3, 0.2, 3.4), roof),
        box("weed1", (0.6, 0.6, 0.5), (2.3, -1.5, 0.25), weed),
        box("weed2", (0.5, 0.5, 0.4), (-2.4, 1.2, 0.2), weed),
    ], "empty_house")
    export("empty_house")


def build_field():
    """畑。畝が5本。昼に人のいない畑に使う"""
    clear()
    soil, crop = material("field_soil", SOIL), material("field_crop", GREEN)
    parts = [box("ground", (8, 6, 0.2), (0, 0, 0.1), soil)]
    for i in range(5):
        y = -2.4 + i * 1.2
        parts.append(box(f"ridge{i}", (7.6, 0.5, 0.35), (0, y, 0.3), soil))
        parts.append(box(f"crop{i}", (7.2, 0.4, 0.3), (0, y, 0.6), crop))
    join(parts, "field")
    export("field")


def build_pear_tree():
    """二十世紀梨の木。丸い樹冠に実の点"""
    clear()
    trunk, leaf, fruit = material("pear_trunk", WOOD), material("pear_leaf", (0.40, 0.58, 0.30)), material("pear_fruit", (0.85, 0.78, 0.45))
    parts = [cylinder("trunk", 0.18, 1.6, (0, 0, 0.8), (0, 0, 0), trunk, verts=8), ball("crown", 1.5, (0, 0, 2.4), leaf)]
    for i, loc in enumerate(((1.0, 0.6, 2.2), (-0.9, 0.8, 2.6), (0.3, -1.2, 2.0), (-0.5, -0.7, 3.0))):
        parts.append(ball(f"fruit{i}", 0.22, loc, fruit))
    join(parts, "pear_tree")
    export("pear_tree")


def build_ginger_cave():
    """生姜穴。山肌の土手に横穴。鳥取市気高町日光の保管庫を模した"""
    clear()
    mound, hole, frame = material("cave_mound", (0.48, 0.52, 0.36)), material("cave_hole", (0.08, 0.07, 0.06)), material("cave_frame", WOOD)
    m = ball("mound", 3.0, (0, 1.5, 0), mound)
    m.scale = (1.4, 1.0, 0.8)
    join([
        m,
        box("hole", (1.4, 0.4, 1.6), (0, -0.9, 0.8), hole),
        box("frame_l", (0.2, 0.3, 1.8), (-0.8, -1.0, 0.9), frame),
        box("frame_r", (0.2, 0.3, 1.8), (0.8, -1.0, 0.9), frame),
        box("frame_t", (1.8, 0.3, 0.2), (0, -1.0, 1.9), frame),
        box("crate", (0.6, 0.5, 0.4), (1.5, -1.6, 0.2), frame),
    ], "ginger_cave")
    export("ginger_cave")


def build_person():
    """人。胴の材質名 person_body を実行時に役割の色へ差し替える"""
    clear()
    body, skin, hair = material("person_body", (0.35, 0.45, 0.62)), material("person_skin", SKIN), material("person_hair", (0.15, 0.12, 0.10))
    join([
        box("legs", (0.5, 0.3, 0.7), (0, 0, 0.35), material("person_legs", (0.25, 0.25, 0.3))),
        box("torso", (0.6, 0.35, 0.7), (0, 0, 1.05), body),
        box("head", (0.45, 0.42, 0.45), (0, 0, 1.65), skin),
        box("hair", (0.47, 0.44, 0.2), (0, 0, 1.82), hair),
    ], "person")
    export("person")


def build_rabbit():
    """因幡の白兎。案内役"""
    clear()
    fur, ear, eye = material("rabbit_fur", (0.98, 0.98, 0.96)), material("rabbit_ear", (0.95, 0.72, 0.72)), material("rabbit_eye", (0.1, 0.1, 0.1))
    join([
        box("body", (0.7, 0.9, 0.55), (0, 0, 0.3), fur),
        box("head", (0.55, 0.5, 0.5), (0, -0.5, 0.75), fur),
        box("ear_l", (0.14, 0.12, 0.6), (-0.16, -0.5, 1.25), fur),
        box("ear_r", (0.14, 0.12, 0.6), (0.16, -0.5, 1.25), fur),
        box("inner_l", (0.06, 0.05, 0.4), (-0.16, -0.56, 1.25), ear),
        box("inner_r", (0.06, 0.05, 0.4), (0.16, -0.56, 1.25), ear),
        box("eye_l", (0.06, 0.04, 0.06), (-0.15, -0.76, 0.8), eye),
        box("eye_r", (0.06, 0.04, 0.06), (0.15, -0.76, 0.8), eye),
        box("tail", (0.2, 0.2, 0.2), (0, 0.5, 0.4), fur),
    ], "rabbit")
    export("rabbit")


def build_school():
    clear()
    wall, roof, clock = material("school_wall", (0.92, 0.90, 0.84)), material("school_roof", ROOF), material("school_clock", ACCENT)
    parts = [
        box("body", (10, 4, 5.5), (0, 0, 2.75), wall),
        box("roof", (10.4, 4.4, 0.3), (0, 0, 5.65), roof),
        box("clock", (1.0, 0.1, 1.0), (0, -2.05, 4.6), clock),
    ]
    win = material("school_win", (0.55, 0.70, 0.82))
    for i in range(4):
        parts.append(box(f"win{i}", (1.2, 0.08, 1.0), (-3.6 + i * 2.4, -2.03, 2.0), win))
    join(parts, "school")
    export("school")


def build_workshop():
    """事業所。小さな工場。架空の事業者に使う"""
    clear()
    wall, roof, door = material("ws_wall", (0.80, 0.82, 0.84)), material("ws_roof", (0.35, 0.38, 0.42)), material("ws_door", ACCENT)
    join([
        box("body", (8, 6, 4), (0, 0, 2), wall),
        box("roof_a", (4.2, 6.2, 0.3), (-2, 0, 4.4), roof),
        box("roof_b", (4.2, 6.2, 0.3), (2, 0, 4.4), roof),
        box("door", (2.2, 0.1, 2.6), (0, -3.03, 1.3), door),
        cylinder("chimney", 0.3, 2.0, (2.5, 1.5, 5.0), (0, 0, 0), roof, verts=10),
    ], "workshop")
    export("workshop")


def build_road():
    """道のタイル1枚。4m × 4m。並べて道にする"""
    clear()
    join([box("tile", (4, 4, 0.12), (0, 0, 0.06), material("road", (0.72, 0.70, 0.66)))], "road")
    export("road")


for build in (build_house, build_shop, build_empty_house, build_field, build_pear_tree, build_ginger_cave, build_person, build_rabbit, build_school, build_workshop, build_road):
    build()

build_bus()
build_stop()
print("done")
