// 足もとの草花。主人公のまわりにだけ生やし、歩くと付いてくる。
// 置く場所は格子ごとに決まった乱数なので、戻ってきても同じ所に同じ草がある
import * as THREE from "three";
import type { Ground, Vec2 } from "@/lib/world";

const STEP = 1.3; // 草を置く格子の間隔
const RADIUS = 30; // カメラに映る範囲より少し広く
const AHEAD = 5; // カメラは南から見るので、北へずらした所を中心にする
const MOVE = 5; // 前に置いた中心からこれだけ離れたら置き直す
const CAP = 2400;
const BUCKET = 4; // 障害物を引く格子の大きさ
const NO_OUTLINE = { visible: false };

type Kind = { meshes: THREE.InstancedMesh[]; locals: THREE.Matrix4[]; count: number };

export class Scatter {
  readonly group = new THREE.Group();
  private kinds = new Map<string, Kind>();
  private center: Vec2 | null = null;
  private buckets = new Map<string, { at: Vec2; radius: number }[]>();

  constructor(
    models: Map<string, THREE.Group>,
    private ground: Ground,
    obstacles: { at: Vec2; radius: number }[],
    private height: (x: number, z: number) => number,
    private paved: (x: number, z: number) => boolean,
  ) {
    for (const name of ["grass_tuft", "flower_tuft", "dune_grass"]) {
      const base = models.get(name);
      if (base) this.kinds.set(name, this.makeKind(base));
    }
    for (const o of obstacles) {
      for (let bx = Math.floor((o.at[0] - o.radius) / BUCKET); bx <= Math.floor((o.at[0] + o.radius) / BUCKET); bx++)
        for (let bz = Math.floor((o.at[1] - o.radius) / BUCKET); bz <= Math.floor((o.at[1] + o.radius) / BUCKET); bz++) {
          const key = `${bx},${bz}`;
          this.buckets.set(key, [...(this.buckets.get(key) ?? []), o]);
        }
    }
  }

  /** 主人公の位置を渡す。離れたときだけ置き直す */
  update(x: number, z: number) {
    const cz = z - AHEAD;
    if (this.center && Math.hypot(x - this.center[0], cz - this.center[1]) < MOVE) return;
    this.center = [x, cz];
    for (const k of this.kinds.values()) k.count = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    for (let gi = Math.floor((x - RADIUS) / STEP); gi <= Math.ceil((x + RADIUS) / STEP); gi++) {
      for (let gj = Math.floor((cz - RADIUS) / STEP); gj <= Math.ceil((cz + RADIUS) / STEP); gj++) {
        const px = (gi + hash(gi, gj)) * STEP;
        const pz = (gj + hash(gj * 1.7, gi * 0.3)) * STEP;
        if (Math.hypot(px - x, pz - cz) > RADIUS) continue;
        const name = this.pick(px, pz, hash(gi * 3.1, gj * 7.7));
        const kind = name ? this.kinds.get(name) : undefined;
        if (!kind || kind.count >= CAP) continue;
        const roll = hash(gi * 0.7, gj * 2.3);
        m.compose(p.set(px, this.height(px, pz), pz), q.setFromAxisAngle(up, roll * Math.PI * 2), s.setScalar(0.75 + roll * 0.6));
        c.setScalar(0.85 + hash(gj, gi) * 0.3);
        kind.meshes.forEach((mesh, i) => {
          mesh.setMatrixAt(kind.count, m.clone().multiply(kind.locals[i]));
          mesh.setColorAt(kind.count, c);
        });
        kind.count++;
      }
    }
    for (const k of this.kinds.values())
      for (const mesh of k.meshes) {
        mesh.count = k.count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
  }

  /** その場所に生やす草の種類。歩けない所・水・道・舗装・物の下には生やさない */
  private pick(x: number, z: number, roll: number): string | null {
    const g = this.ground;
    const q = Math.round((x - g.x0) / g.cell);
    const r = Math.round((z - g.z0) / g.cell);
    if (q < 0 || r < 0 || q >= g.w || r >= g.h) return null;
    const mask = g.mask[r * g.w + q];
    if (!(mask & 1) || mask & 12 || this.paved(x, z) || this.blocked(x, z)) return null;
    if (mask & 16) return roll < 0.1 ? "dune_grass" : null;
    if (roll < 0.05) return "flower_tuft";
    return roll < 0.6 ? "grass_tuft" : null;
  }

  private blocked(x: number, z: number): boolean {
    const list = this.buckets.get(`${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`) ?? [];
    return list.some((o) => Math.hypot(x - o.at[0], z - o.at[1]) < o.radius);
  }

  private makeKind(base: THREE.Group): Kind {
    base.updateMatrixWorld(true);
    const kind: Kind = { meshes: [], locals: [], count: 0 };
    base.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const material = (o.material as THREE.Material).clone();
      material.userData.outlineParameters = NO_OUTLINE;
      const mesh = new THREE.InstancedMesh(o.geometry, material, CAP);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0;
      mesh.frustumCulled = false;
      kind.meshes.push(mesh);
      kind.locals.push(o.matrixWorld.clone());
      this.group.add(mesh);
    });
    return kind;
  }
}

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
