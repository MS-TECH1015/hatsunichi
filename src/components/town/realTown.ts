// 実在の町。PLATEAU の建物・道路・土地利用・鉄道（scripts/build_real_towns.py が書いた public/city/towns/<町>.json）を three.js の形にする。
// 町は市の地図（1 単位 50 m）とは別の、離れた所に 1 単位 1.5 m で置く。バスを降りたらここへ移り、乗ったら市の地図へ戻る。
// 地面の色分けと道路は 1 枚の絵に描いて、起伏のある地面に貼る。建物は町ごとに 1 つの形へまとめる
import * as THREE from "three";
import type { Vec2 } from "@/lib/world";

export type RealTownData = {
  m_per_unit: number;
  radius: number;
  /** 地面の高さ（m）の格子。原点が中心、cell 単位おき、n×n */
  ground?: { cell: number; n: number; h: number[] };
  buildings: { h: number; ring: Vec2[] }[];
  roads: { k: string; ring: Vec2[] }[];
  land: { k: string; ring: Vec2[] }[];
  rail: Vec2[][];
};

const LAND_COLORS: Record<string, string> = {
  paddy: "#cfdc9a",
  field: "#ddd2a4",
  forest: "#7fa66a",
  wild: "#b9cc94",
  park: "#a9cf8c",
  home: "#ebe4d2",
  shop: "#e9e1d0",
  work: "#e2ddd2",
  public: "#e6e0d4",
  open: "#e2dcc6",
  rail: "#d9d2c2",
  road: "#e8e2d2",
  water: "#7fb8de",
};
const BASE = "#e6dfca";
const OUTSIDE = 160; // 町の円の外にのばす地面の幅（単位）。霧で消えるまでつなぐ
const TEX = 2048;
const ROOFS = [0x9e3826, 0x4d5770, 0x3f6b96, 0x74503a, 0x5b5b5b];
const WALLS = [0xf1e6cf, 0xe4e2dc, 0xeadbc0, 0xf6f2ea, 0xe8dccb];
const TALL_WALLS = [0xdcd9d2, 0xcfd3d8, 0xe4dfd4, 0xd6cfc4];
const HOUSE_MAX_H = 12; // これより低い m の、四角に近い小さな建物は切妻の屋根をのせる
const HOUSE_MAX_AREA = 320; // m²
const GRID = 24; // ぶつかり判定の区画の大きさ（単位）

type Poly = { ring: Vec2[]; minX: number; maxX: number; minZ: number; maxZ: number };

function bounds(ring: Vec2[]): Poly {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { ring, minX, maxX, minZ, maxZ };
}

function inside(p: Poly, x: number, z: number): boolean {
  if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) return false;
  let hit = false;
  const r = p.ring;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** 多角形を区画に分けて引けるようにする */
class PolyIndex {
  private cells = new Map<string, Poly[]>();
  add(p: Poly) {
    for (let gx = Math.floor(p.minX / GRID); gx <= Math.floor(p.maxX / GRID); gx++)
      for (let gz = Math.floor(p.minZ / GRID); gz <= Math.floor(p.maxZ / GRID); gz++) {
        const k = `${gx},${gz}`;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k)!.push(p);
      }
  }
  hit(x: number, z: number): boolean {
    return (this.cells.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) ?? []).some((p) => inside(p, x, z));
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function signedArea(r: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, z1] = r[i];
    const [x2, z2] = r[(i + 1) % r.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** 面積が最小の外接長方形。[中心, 長い辺の向き, 長い辺の半分, 短い辺の半分, 面積] */
function minRect(ring: Vec2[]): { c: Vec2; u: Vec2; a: number; b: number; area: number } {
  let best = { c: [0, 0] as Vec2, u: [1, 0] as Vec2, a: 0, b: 0, area: Infinity };
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1e-6) continue;
    const ux = (x2 - x1) / len, uz = (z2 - z1) / len;
    let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity;
    for (const [x, z] of ring) {
      const s = x * ux + z * uz;
      const t = -x * uz + z * ux;
      lo = Math.min(lo, s); hi = Math.max(hi, s); lo2 = Math.min(lo2, t); hi2 = Math.max(hi2, t);
    }
    const area = (hi - lo) * (hi2 - lo2);
    if (area < best.area) {
      const ms = (lo + hi) / 2, mt = (lo2 + hi2) / 2;
      const c: Vec2 = [ms * ux - mt * uz, ms * uz + mt * ux];
      const long = hi - lo >= hi2 - lo2;
      best = { c, u: long ? [ux, uz] : [-uz, ux], a: Math.max(hi - lo, hi2 - lo2) / 2, b: Math.min(hi - lo, hi2 - lo2) / 2, area };
    }
  }
  return best;
}

/** 三角形を足す道具。向きは want の側へ法線が向くように並べ替える */
class Builder {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  tri(a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, color: number, want: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const [p, q] = n.dot(want) >= 0 ? [b, d] : [d, b];
    this.c.setHex(color);
    for (const v of [a, p, q]) {
      this.pos.push(v.x, v.y, v.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number, want: THREE.Vector3) {
    this.tri(a, b, c, color, want);
    this.tri(a, c, d, color, want);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

export class RealTown {
  readonly group = new THREE.Group();
  private blocks = new PolyIndex();
  private water = new PolyIndex();
  private bridges = new PolyIndex();
  private disposables: { dispose(): void }[] = [];

  constructor(
    readonly id: string,
    readonly origin: Vec2,
    private data: RealTownData,
    gradientMap: THREE.Texture,
  ) {
    this.group.position.set(origin[0], 0, origin[1]);
    this.group.add(this.buildGround(gradientMap));
    this.group.add(this.buildBuildings(gradientMap));
    for (const r of data.roads) this.bridges.add(bounds(r.ring));
    for (const a of data.land) if (a.k === "water") this.water.add(bounds(a.ring));
  }

  get radius() {
    return this.data.radius;
  }

  /** 町の中の座標での地面の高さ（単位）。中心を 0 にする */
  heightLocal(x: number, z: number): number {
    const g = this.data.ground;
    if (!g) return 0;
    const half = ((g.n - 1) * g.cell) / 2;
    const fx = Math.min(Math.max((x + half) / g.cell, 0), g.n - 1.001);
    const fz = Math.min(Math.max((z + half) / g.cell, 0), g.n - 1.001);
    const q = Math.floor(fx), r = Math.floor(fz);
    const tx = fx - q, tz = fz - r;
    const h = (rr: number, qq: number) => g.h[rr * g.n + qq];
    const top = h(r, q) * (1 - tx) + h(r, q + 1) * tx;
    const bottom = h(r + 1, q) * (1 - tx) + h(r + 1, q + 1) * tx;
    return (top * (1 - tz) + bottom * tz) / this.data.m_per_unit;
  }

  /** 世界の座標がこの町の中か */
  contains(at: Vec2): boolean {
    return Math.hypot(at[0] - this.origin[0], at[1] - this.origin[1]) < this.data.radius + OUTSIDE;
  }

  heightAt(at: Vec2): number {
    return this.heightLocal(at[0] - this.origin[0], at[1] - this.origin[1]);
  }

  /** 歩けるか。建物の中・川の中（橋の上は歩ける）・町の円の外は歩けない */
  walkable(at: Vec2): boolean {
    const x = at[0] - this.origin[0], z = at[1] - this.origin[1];
    if (Math.hypot(x, z) > this.data.radius - 4) return false;
    if (this.blocks.hit(x, z)) return false;
    return !this.water.hit(x, z) || this.bridges.hit(x, z);
  }

  step(from: Vec2, to: Vec2): Vec2 {
    if (this.walkable(to)) return to;
    if (this.walkable([to[0], from[1]])) return [to[0], from[1]];
    if (this.walkable([from[0], to[1]])) return [from[0], to[1]];
    return from;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }

  // ---- 地面 ----
  private buildGround(gradientMap: THREE.Texture): THREE.Mesh {
    const size = (this.data.radius + OUTSIDE) * 2;
    const seg = 200;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, this.heightLocal(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(this.paint(size));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap });
    mat.userData.outlineParameters = { visible: false };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.disposables.push(geo, tex, mat);
    return mesh;
  }

  private paint(size: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TEX;
    const g = canvas.getContext("2d")!;
    const s = TEX / size;
    const px = ([x, z]: Vec2): [number, number] => [(x + size / 2) * s, (z + size / 2) * s];
    const path = (ring: Vec2[]) => {
      g.beginPath();
      ring.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
      g.closePath();
    };
    g.fillStyle = BASE;
    g.fillRect(0, 0, TEX, TEX);
    for (const a of this.data.land) {
      if (a.k === "water") continue;
      g.fillStyle = LAND_COLORS[a.k] ?? BASE;
      path(a.ring);
      g.fill();
    }
    for (const a of this.data.land) {
      if (a.k !== "water") continue;
      g.fillStyle = LAND_COLORS.water;
      path(a.ring);
      g.fill();
    }
    g.lineJoin = "round";
    g.strokeStyle = "#8d8a84";
    g.lineWidth = Math.max(1, 0.6 * s);
    g.fillStyle = "#a9a7a2";
    for (const r of this.data.roads) {
      path(r.ring);
      g.fill();
      g.stroke();
    }
    for (const line of this.data.rail) {
      g.beginPath();
      line.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
      g.strokeStyle = "#9b8f80";
      g.lineWidth = 3.4 / this.data.m_per_unit * s;
      g.stroke();
      g.strokeStyle = "#4a4440";
      g.lineWidth = 0.9 / this.data.m_per_unit * s;
      g.setLineDash([0.6 * s, 0.4 * s]);
      g.stroke();
      g.setLineDash([]);
    }
    return canvas;
  }

  // ---- 建物 ----
  private buildBuildings(gradientMap: THREE.Texture): THREE.Mesh {
    const b = new Builder();
    const m = this.data.m_per_unit;
    this.data.buildings.forEach((bl, i) => {
      let ring = bl.ring;
      if (signedArea(ring) < 0) ring = [...ring].reverse();
      const poly = bounds(ring);
      this.blocks.add(poly);
      const base = Math.min(...ring.map(([x, z]) => this.heightLocal(x, z))) - 0.4;
      const top = Math.max(...ring.map(([x, z]) => this.heightLocal(x, z))) + bl.h / m;
      const areaM2 = Math.abs(signedArea(ring)) * m * m;
      const rect = minRect(ring);
      const house = bl.h <= HOUSE_MAX_H && areaM2 <= HOUSE_MAX_AREA && Math.abs(signedArea(ring)) / rect.area > 0.8;
      const wall = house ? WALLS[Math.floor(hash(i) * WALLS.length)] : TALL_WALLS[Math.floor(hash(i) * TALL_WALLS.length)];
      const [cx, cz] = [(poly.minX + poly.maxX) / 2, (poly.minZ + poly.maxZ) / 2];
      for (let k = 0; k < ring.length; k++) {
        const [x1, z1] = ring[k];
        const [x2, z2] = ring[(k + 1) % ring.length];
        const out = new THREE.Vector3(z2 - z1, 0, -(x2 - x1));
        if (out.x * ((x1 + x2) / 2 - cx) + out.z * ((z1 + z2) / 2 - cz) < 0) out.negate();
        b.quad(new THREE.Vector3(x1, base, z1), new THREE.Vector3(x2, base, z2), new THREE.Vector3(x2, top, z2), new THREE.Vector3(x1, top, z1), wall, out);
      }
      if (house) this.gable(b, rect, top, i, wall);
      else this.flatRoof(b, ring, top, wall);
    });
    const geo = b.geometry();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.disposables.push(geo, mat);
    return mesh;
  }

  private flatRoof(b: Builder, ring: Vec2[], top: number, wall: number) {
    const roof = new THREE.Color(wall).multiplyScalar(0.86).getHex();
    const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of tris) {
      b.tri(new THREE.Vector3(ring[i][0], top, ring[i][1]), new THREE.Vector3(ring[j][0], top, ring[j][1]), new THREE.Vector3(ring[k][0], top, ring[k][1]), roof, UP);
    }
  }

  /** 切妻の屋根。外接長方形の長い辺に棟を通し、軒を少し出す */
  private gable(b: Builder, r: ReturnType<typeof minRect>, top: number, i: number, wall: number) {
    const roof = ROOFS[Math.floor(hash(i + 0.5) * ROOFS.length)];
    const [ux, uz] = r.u;
    const [vx, vz] = [-uz, ux];
    const a = r.a + 0.3, w = r.b + 0.35;
    const ridge = top + r.b * 0.55;
    const P = (s: number, t: number, y: number) => new THREE.Vector3(r.c[0] + ux * s + vx * t, y, r.c[1] + uz * s + vz * t);
    const sideV = new THREE.Vector3(vx, 0, vz);
    b.quad(P(-a, w, top - 0.1), P(a, w, top - 0.1), P(a, 0, ridge), P(-a, 0, ridge), roof, sideV.clone().add(UP));
    b.quad(P(-a, -w, top - 0.1), P(a, -w, top - 0.1), P(a, 0, ridge), P(-a, 0, ridge), roof, sideV.clone().negate().add(UP));
    const endU = new THREE.Vector3(ux, 0, uz);
    b.tri(P(r.a, r.b, top), P(r.a, -r.b, top), P(r.a, 0, ridge - 0.05), wall, endU);
    b.tri(P(-r.a, r.b, top), P(-r.a, -r.b, top), P(-r.a, 0, ridge - 0.05), wall, endU.clone().negate());
  }
}
