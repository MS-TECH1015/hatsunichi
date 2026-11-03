// 町の通り・歩道・飾り。scripts/towns.py が組んだ配置（city.json の towns）を three.js の形にする。
// 飾りは町ごとに 1 つの形へまとめ、色は頂点に入れる。部品ごとに描くと数千回の描画になって重いため。
// 町名や案内図を貼る板だけは絵が要るので、別の形にする
import * as THREE from "three";
import type { Vec2 } from "@/lib/world";
import { busSign, guideMap, paving, shelterName, stationSign, stopName } from "./paint";

export type TownData = {
  style: string;
  /** [種類, x1, z1, x2, z2]。町の中心からの座標 */
  paving: [string, number, number, number, number][];
  /** [部品, x, z, 向き, 大きさ, 色の番号] */
  props: [string, number, number, number, number, number][];
  /** 電線 [x1, z1, x2, z2] */
  wires: [number, number, number, number][];
  /** ぶつかる円 [x, z, 半径] */
  blocks: [number, number, number][];
};
type PlaceRef = { id: string; name: string; at: Vec2 };
type Part = { geometry: THREE.BufferGeometry; local: THREE.Matrix4; name: string; color: THREE.Color };
type Rect = [number, number, number, number, number];

/** 舗装の上面の、地面からの高さ */
const LIFT: Record<string, number> = { asphalt: 0.14, line: 0.15, sidewalk: 0.28, plaza: 0.22, gravel: 0.12, boardwalk: 0.4 };
/** 舗装の絵 1 枚が覆う長さ */
const TILE: Record<string, number> = { asphalt: 6, sidewalk: 2.4, plaza: 3.2, gravel: 4, boardwalk: 3, line: 1 };
const R_TOWN = 21; // scripts/towns.py の R_CUT。ここより外に舗装は無い
const R_NAME = 19; // ここに入ったら町名を出す（R_RING）
const WIRE_HEIGHT = 6.75; // 電柱の腕の高さ
const INK = 0x2b2622;
const ROOFS = [0x9e3826, 0x4d5770, 0x3f6b96, 0x74503a];
const WALLS = [0xf1e6cf, 0xe4e2dc, 0xeadbc0, 0xf6f2ea];
const CARS = [0xf4f4f0, 0xb9bec4, 0x9cc7e0, 0xa8d5b5, 0xe9c9b8];
const BIKES = [0x3c6b55, 0xc0453a, 0x3f6b96, 0x2b2622, 0xe8c547];
const PLANTS = new Set(["leaf", "leaf_dark", "shrub", "shrub_light", "hedge", "hedge_light", "dune_grass", "dune_grass_dry", "grass_blade"]);
/** 絵を貼る板。材質名から、町ごとの絵を作る */
const SIGNS: Record<string, (p: PlaceRef, style: string) => THREE.Texture> = {
  shelter_name: (p) => shelterName(p.name),
  sign_face: () => busSign(),
  sign_name: (p) => stopName(p.name),
  board_face: (p, style) => guideMap(p.name, style),
  station_sign: (p) => stationSign(p.name),
};
const NO_OUTLINE = { visible: false };

export class Towns {
  readonly group = new THREE.Group();
  readonly obstacles: { at: Vec2; radius: number }[] = [];
  private areas: { place: PlaceRef; rects: Rect[] }[] = [];
  private partCache = new Map<string, Part[] | null>();
  private signCache = new Map<string, THREE.Material>();
  private propMaterial: THREE.MeshToonMaterial;

  constructor(
    data: Record<string, TownData>,
    places: PlaceRef[],
    private height: (x: number, z: number) => number,
    private models: Map<string, THREE.Group>,
    private gradientMap: THREE.Texture,
  ) {
    this.propMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
    const slabs = new Map<string, Slabs>();
    const wires: THREE.Vector3[] = [];
    for (const place of places) {
      const town = data[place.id];
      if (!town) continue;
      this.addPaving(place, town, slabs);
      this.addProps(place, town);
      this.addWires(place, town, wires);
      for (const [x, z, r] of town.blocks) this.obstacles.push({ at: [place.at[0] + x, place.at[1] + z], radius: r });
    }
    for (const [kind, s] of slabs) this.group.add(s.mesh(kind, gradientMap));
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), new THREE.LineBasicMaterial({ color: INK })));
  }

  /** 足もとの舗装の高さ。舗装の外は 0 */
  liftAt(x: number, z: number): number {
    const area = this.areas.find((a) => Math.hypot(x - a.place.at[0], z - a.place.at[1]) < R_TOWN);
    if (!area) return 0;
    let lift = 0;
    for (const [x1, z1, x2, z2, l] of area.rects) if (x >= x1 && x <= x2 && z >= z1 && z <= z2) lift = Math.max(lift, l);
    return lift;
  }

  /** いる町の名前。町の外なら null */
  placeAt(x: number, z: number): string | null {
    return this.areas.find((a) => Math.hypot(x - a.place.at[0], z - a.place.at[1]) < R_NAME)?.place.name ?? null;
  }

  private addPaving(place: PlaceRef, town: TownData, slabs: Map<string, Slabs>) {
    const [cx, cz] = place.at;
    const base = this.height(cx, cz);
    const rects: Rect[] = [];
    for (const [kind, ax, az, bx, bz] of town.paving) {
      const x1 = cx + Math.min(ax, bx);
      const x2 = cx + Math.max(ax, bx);
      const z1 = cz + Math.min(az, bz);
      const z2 = cz + Math.max(az, bz);
      if (!slabs.has(kind)) slabs.set(kind, new Slabs());
      slabs.get(kind)!.add(x1, z1, x2, z2, base + LIFT[kind], base - 0.4, TILE[kind], kind !== "line");
      if (kind !== "line") rects.push([x1, z1, x2, z2, LIFT[kind]]);
    }
    this.areas.push({ place, rects });
  }

  private addProps(place: PlaceRef, town: TownData) {
    const merge = new Merge();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [kind, lx, lz, face, scale, v] of town.props) {
      const parts = this.parts(kind);
      if (!parts) continue;
      const x = place.at[0] + lx;
      const z = place.at[1] + lz;
      m.compose(p.set(x, this.height(x, z) + this.liftAt(x, z), z), q.setFromAxisAngle(up, (face * Math.PI) / 2), s.setScalar(scale));
      const shade = 0.88 + hash(x, z) * 0.24;
      for (const part of parts) {
        const matrix = m.clone().multiply(part.local);
        if (part.name in SIGNS) this.addSign(part, matrix, place, town.style);
        else merge.add(part.geometry, matrix, colorOf(kind, part, v, shade));
      }
    }
    const mesh = new THREE.Mesh(merge.geometry(), this.propMaterial);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** 町名・のりば・案内図の板。同じ町の同じ絵は使い回す */
  private addSign(part: Part, matrix: THREE.Matrix4, place: PlaceRef, style: string) {
    const key = part.name === "sign_face" ? part.name : `${part.name}:${place.id}`;
    let material = this.signCache.get(key);
    if (!material) {
      material = new THREE.MeshToonMaterial({ map: SIGNS[part.name](place, style), gradientMap: this.gradientMap, alphaTest: part.name === "sign_face" ? 0.5 : 0 });
      material.userData.outlineParameters = NO_OUTLINE;
      this.signCache.set(key, material);
    }
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    this.group.add(mesh);
  }

  /** 電柱から電柱へ、たるんだ 2 本の電線 */
  private addWires(place: PlaceRef, town: TownData, out: THREE.Vector3[]) {
    const top = (x: number, z: number) => this.height(x, z) + this.liftAt(x, z) + WIRE_HEIGHT;
    for (const [ax, az, bx, bz] of town.wires) {
      const a = new THREE.Vector3(place.at[0] + ax, 0, place.at[1] + az);
      const b = new THREE.Vector3(place.at[0] + bx, 0, place.at[1] + bz);
      a.y = top(a.x, a.z);
      b.y = top(b.x, b.z);
      const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).setLength(0.6);
      for (const k of [-1, 1]) {
        const pa = a.clone().addScaledVector(side, k);
        const pb = b.clone().addScaledVector(side, k);
        const mid = pa.clone().lerp(pb, 0.5);
        mid.y -= 0.65;
        const pts = new THREE.QuadraticBezierCurve3(pa, mid, pb).getPoints(12);
        for (let i = 0; i + 1 < pts.length; i++) out.push(pts[i], pts[i + 1]);
      }
    }
  }

  /** 部品の形を、材質の名前と色ごとに取り出す */
  private parts(kind: string): Part[] | null {
    if (this.partCache.has(kind)) return this.partCache.get(kind)!;
    const base = this.models.get(kind);
    if (!base) {
      console.warn(`部品が無い: ${kind}`);
      this.partCache.set(kind, null);
      return null;
    }
    base.updateMatrixWorld(true);
    const out: Part[] = [];
    base.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const material = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.MeshToonMaterial;
      if (!o.geometry.getAttribute("normal")) o.geometry.computeVertexNormals();
      out.push({ geometry: o.geometry, local: o.matrixWorld.clone(), name: material.name, color: material.color.clone() });
    });
    this.partCache.set(kind, out);
    return out;
  }
}

/** 家の屋根と壁、車と自転車の色を、配置の番号で変える。草木は場所ごとに濃さを揺らす */
function colorOf(kind: string, part: Part, v: number, shade: number): THREE.Color {
  const c = part.color.clone();
  const house = kind.startsWith("house");
  if (house && part.name === "roof") return c.set(ROOFS[v % ROOFS.length]);
  if (house && part.name === "roof_ridge") return c.set(ROOFS[v % ROOFS.length]).multiplyScalar(0.7);
  if (house && part.name === "wall") return c.set(WALLS[v % WALLS.length]);
  if (part.name === "car_body") return c.set(CARS[v % CARS.length]);
  if (part.name === "bike_frame") return c.set(BIKES[v % BIKES.length]);
  if (PLANTS.has(part.name)) return c.multiplyScalar(shade);
  return c;
}

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 頂点に色を入れながら、形を 1 つに足していく */
class Merge {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private v = new THREE.Vector3();
  private normalMatrix = new THREE.Matrix3();

  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color) {
    const p = geo.getAttribute("position");
    const n = geo.getAttribute("normal");
    const base = this.pos.length / 3;
    this.normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.fromBufferAttribute(n, i).applyMatrix3(this.normalMatrix).normalize();
      this.nor.push(this.v.x, this.v.y, this.v.z);
      this.col.push(color.r, color.g, color.b);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** 舗装の板。上面と側面。絵は世界の座標で貼るので、隣の板と模様の継ぎ目が合う */
class Slabs {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];

  add(x1: number, z1: number, x2: number, z2: number, top: number, bottom: number, tile: number, sides: boolean) {
    const t = (u: number, v: number) => [u / tile, v / tile];
    this.quad([x1, top, z1], [x1, top, z2], [x2, top, z2], [x2, top, z1], [0, 1, 0], [t(x1, z1), t(x1, z2), t(x2, z2), t(x2, z1)]);
    if (!sides) return;
    const wall = (a: number, b: number) => [t(a, bottom), t(b, bottom), t(b, top), t(a, top)];
    this.quad([x1, bottom, z1], [x2, bottom, z1], [x2, top, z1], [x1, top, z1], [0, 0, -1], wall(x1, x2));
    this.quad([x1, bottom, z2], [x2, bottom, z2], [x2, top, z2], [x1, top, z2], [0, 0, 1], wall(x1, x2));
    this.quad([x1, bottom, z1], [x1, bottom, z2], [x1, top, z2], [x1, top, z1], [-1, 0, 0], wall(z1, z2));
    this.quad([x2, bottom, z1], [x2, bottom, z2], [x2, top, z2], [x2, top, z1], [1, 0, 0], wall(z1, z2));
  }

  /** 4 点の面。表が normal を向くよう、必要なら並びを裏返す */
  private quad(a: number[], b: number[], c: number[], d: number[], normal: number[], uvs: number[][]) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    const pts = [a, b, c, d];
    for (const i of order) {
      this.pos.push(...pts[i]);
      this.nor.push(...normal);
      this.uv.push(...uvs[i]);
    }
  }

  mesh(kind: string, gradientMap: THREE.Texture): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const art = paving[kind as keyof typeof paving];
    const material = new THREE.MeshToonMaterial({ gradientMap, ...(art ? { map: art() } : { color: 0x8a8d92 }) });
    material.userData.outlineParameters = NO_OUTLINE;
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}
