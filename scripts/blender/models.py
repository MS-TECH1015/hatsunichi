"""Blender でアプリの 3D モデルを作り、public/models/ に glTF で書き出す。

実行: blender -b --python scripts/blender/models.py
作るもの: バス（bus.glb）、停留所の標識（stop.glb）。どちらも低ポリで、2026-11-03 に新規に作った。
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


build_bus()
build_stop()
print("done")
