"""鳥取市全域の地形を Blender で作る。

入力は scripts/build_city.py の出力（data/build/city.npz と city_lines.json）。
出力は public/models/city.glb（地形・水・川・バス路線）と public/city/height.bin（足もとの高さ）。
実行: "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python scripts/blender/city.py
three.js の (x, y, z) は Blender の (x, -z, y)。1 単位 = 50 m。
"""
import json
import os

import bmesh
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree

ROOT = os.getcwd()
DECIMATE = 0.22  # 面の数を 22% まで減らす。平地と海はほとんど消え、山の形は残る
BOTTOM = -6.0  # 模型の台の底
ROAD_W = 2.4  # 町の本通りより少し細い、2 車線の道
LIFT = 0.14  # 川と道を地面から浮かせる量

data = np.load(os.path.join(ROOT, "data", "build", "city.npz"))
Y, COL, KEEP = data["y"], data["col"], data["keep"]
X0, Z0, CELL, W, H = data["grid"]
W, H = int(W), int(H)
LINES = json.load(open(os.path.join(ROOT, "data", "build", "city_lines.json"), encoding="utf-8"))
XMIN, XMAX = X0, X0 + (W - 1) * CELL
YMAX, YMIN = -Z0, -(Z0 + (H - 1) * CELL)  # Blender の y（北が +）


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def material(name, rgb, vertex_color=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    if vertex_color:
        node = m.node_tree.nodes.new("ShaderNodeVertexColor")
        node.layer_name = "Col"
        m.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def new_object(name, verts, faces, mats):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    for m in mats:
        me.materials.append(m)
    return o


def terrain():
    quad = KEEP[:-1, :-1] | KEEP[1:, :-1] | KEEP[:-1, 1:] | KEEP[1:, 1:]
    used = np.zeros((H, W), bool)
    for dr, dq in ((0, 0), (1, 0), (0, 1), (1, 1)):
        used[dr:H - 1 + dr, dq:W - 1 + dq] |= quad
    rs, qs = np.nonzero(used)
    idx = -np.ones((H, W), np.int64)
    idx[rs, qs] = np.arange(len(rs))
    verts = np.stack([X0 + qs * CELL, -(Z0 + rs * CELL), Y[rs, qs]], 1)
    qr, qq = np.nonzero(quad)
    faces = np.stack([idx[qr, qq], idx[qr + 1, qq], idx[qr + 1, qq + 1], idx[qr, qq + 1]], 1)
    o = new_object("terrain", verts.tolist(), faces.tolist(), [material("terrain", (1, 1, 1), True), material("skirt", (0.5, 0.36, 0.24))])
    ca = o.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([np.power(COL[rs, qs], 2.2), np.ones((len(rs), 1))], 1).astype(np.float32)  # sRGB の色を線形にして入れる
    ca.data.foreach_set("color", rgba.ravel())
    o.data.color_attributes.active_color = ca
    print("terrain faces before", len(faces))

    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    mod = o.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = DECIMATE
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print("terrain faces after", len(o.data.polygons))
    skirt(o)
    return o


def skirt(o):
    """外周の辺を台の底まで下ろして、模型の断面にする"""
    bm = bmesh.new()
    bm.from_mesh(o.data)

    def on_edge(v):
        return min(abs(v.co.x - XMIN), abs(v.co.x - XMAX), abs(v.co.y - YMIN), abs(v.co.y - YMAX)) < 1e-3

    edges = [e for e in bm.edges if e.is_boundary and on_edge(e.verts[0]) and on_edge(e.verts[1])]
    res = bmesh.ops.extrude_edge_only(bm, edges=edges)
    for g in res["geom"]:
        if isinstance(g, bmesh.types.BMVert):
            g.co.z = BOTTOM
        elif isinstance(g, bmesh.types.BMFace):
            g.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=[g for g in res["geom"] if isinstance(g, bmesh.types.BMFace)])
    bm.to_mesh(o.data)
    bm.free()


def water():
    """海と湖の水面。台の側面も水の色で囲む。陸の断面と重ならないよう少し内側に置く"""
    e = 0.05
    x1, x2, y1, y2 = XMIN + e, XMAX - e, YMIN + e, YMAX - e
    verts = [(x1, y1, 0), (x2, y1, 0), (x2, y2, 0), (x1, y2, 0), (x1, y1, BOTTOM + e), (x2, y1, BOTTOM + e), (x2, y2, BOTTOM + e), (x1, y2, BOTTOM + e)]
    faces = [(0, 1, 2, 3), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    o = new_object("water", verts, faces, [material("water", (0.43, 0.69, 0.83)), material("water_side", (0.27, 0.48, 0.64))])
    for p in o.data.polygons:
        p.material_index = 0 if p.index == 0 else 1
    return o


class Ground:
    def __init__(self, o):
        deps = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(o, deps)

    def height(self, x, yb, fallback=-1.5):
        hit = self.bvh.ray_cast((x, yb, 200.0), (0, 0, -1))
        return hit[0].z if hit[0] is not None else fallback


def ribbon(name, lines, mat, ground, tile):
    """線（川・道）を地面に沿う帯にする。横に 3 点並べ、1 点ずつ地面の高さを取る。
    UV は横が 0〜1、縦が線に沿った長さ / tile。three.js で白線や流れの模様を貼る"""
    verts, faces, uvs = [], [], []
    for pts in lines:
        if len(pts) < 2:
            continue
        base = len(verts)
        n = len(pts)
        s = 0.0
        for i, (x, z, w) in enumerate(pts):
            if i:
                s += ((x - pts[i - 1][0]) ** 2 + (z - pts[i - 1][1]) ** 2) ** 0.5
            a = pts[max(0, i - 1)]
            b = pts[min(n - 1, i + 1)]
            tx, ty = b[0] - a[0], -(b[1] - a[1])
            ln = max(1e-6, (tx * tx + ty * ty) ** 0.5)
            nx, ny = -ty / ln, tx / ln
            for side in (-0.5, 0.0, 0.5):
                vx, vy = x + nx * w * side, -z + ny * w * side
                verts.append((vx, vy, ground.height(vx, vy) + LIFT))
                uvs.append((side + 0.5, s / tile))
        for i in range(n - 1):
            r0, r1 = base + i * 3, base + (i + 1) * 3
            faces.append((r0, r0 + 1, r1 + 1, r1))
            faces.append((r0 + 1, r0 + 2, r1 + 2, r1 + 1))
    o = new_object(name, verts, faces, [mat])
    uv = o.data.uv_layers.new(name="UVMap")
    for loop in o.data.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:  # 上を向かせる
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(o.data)
    bm.free()
    return o


def road_lines():
    """build_city.py が 1 単位ごとに区切った道の折れ線に、幅を付ける"""
    return [[(x, z, ROAD_W) for x, z in line] for line in LINES["roads"]]


def height_map(ground):
    xs = X0 + np.arange(W) * CELL
    zs = Z0 + np.arange(H) * CELL
    out = np.zeros((H, W), np.int16)
    for r, z in enumerate(zs):
        for q, x in enumerate(xs):
            out[r, q] = int(round(ground.height(float(x), float(-z), float(Y[r, q])) * 100))
    path = os.path.join(ROOT, "public", "city", "height.bin")
    out.astype("<i2").tofile(path)
    print("height.bin", path, out.min() / 100, out.max() / 100)


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    args = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_normals=False,
                export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                export_draco_position_quantization=16, export_draco_color_quantization=8,
                export_draco_texcoord_quantization=16)
    try:
        bpy.ops.export_scene.gltf(**args, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**args, export_colors=True)
    print("exported", path, os.path.getsize(path))


clear()
land = terrain()
ground = Ground(land)
water()
ribbon("rivers", LINES["rivers"], material("river", (0.43, 0.69, 0.85)), ground, 2.0)
ribbon("roads", road_lines(), material("road", (0.42, 0.44, 0.47)), ground, ROAD_W)
height_map(ground)
export(os.path.join(ROOT, "public", "models", "city.glb"))
print("done")
