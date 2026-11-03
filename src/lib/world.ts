// 模型の町の型と、歩き回りの計算。three.js に依存しないので vitest で試せる
export type Vec2 = [number, number];

export type Note = { good: string; gap: string; question: string };
/** label は画面の選択肢に出す短い言い方。text は詳細と記録に残す言い方 */
export type Option = { text: string; label: string; note: Note };
export type Fact = { text: string; source: string };
export type Window = { name: string; url: string; checked: string; note: string };

export type Spot = {
  id: string;
  kind: string;
  at: Vec2;
  face: number;
  radius: number;
  title: string;
  /** 近づいて調べたときに出す一言 */
  hint: string;
  /** 依頼を口にする人の名前 */
  asker: string;
  /** 案を出したときに押す判子の1字 */
  stamp: string;
  why: string;
  facts: Fact[];
  quest: { ask: string; options: Option[] };
  window: Window;
  /** もっと深く解く画面。バス停なら地図の作業台 */
  deeper?: { label: string; href: string };
};

export type Npc = {
  id: string;
  kind: "person" | "rabbit";
  at: Vec2;
  face: number;
  name: string;
  role: string;
  body?: [number, number, number];
  hair?: [number, number, number];
  lines: string[];
};

export type Prop = { kind: string; at: Vec2; face: number; scale?: number };
export type Road = { from: Vec2; to: Vec2 };

export type World = {
  meta: { tile: number; start: Vec2; island: { min: Vec2; max: Vec2 }; clock: { start_hour: number; end_hour: number; minutes_per_second: number; minutes_per_talk: number } };
  roads: Road[];
  props: Prop[];
  spots: Spot[];
  npcs: Npc[];
  sources: Record<string, { name: string; url: string; date: string; note: string }>;
};

export type Target = { type: "spot"; spot: Spot } | { type: "npc"; npc: Npc };

export const TALK_RANGE = 2.2;
export const PROP_RADIUS: Record<string, number> = { house: 2.4, house_b: 2.4, pear_tree: 0.6, field: 4.2, school: 5.2, tree: 0.9, pole: 0.3, vending: 0.7, bench: 0.8, hill: 9 };

/** 道のタイルの中心座標。from と to は格子の座標（タイル単位） */
export function roadTiles(roads: Road[]): Vec2[] {
  const seen = new Set<string>();
  const tiles: Vec2[] = [];
  for (const r of roads) {
    const dx = Math.sign(r.to[0] - r.from[0]);
    const dz = Math.sign(r.to[1] - r.from[1]);
    const n = Math.max(Math.abs(r.to[0] - r.from[0]), Math.abs(r.to[1] - r.from[1]));
    for (let i = 0; i <= n; i++) {
      const x = r.from[0] + dx * i;
      const z = r.from[1] + dz * i;
      const key = `${x},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push([x, z]);
    }
  }
  return tiles;
}

/** 歩く人が物に入らないよう、円の外へ押し出す */
export function pushOut(pos: Vec2, obstacles: { at: Vec2; radius: number }[]): Vec2 {
  let [x, z] = pos;
  for (const o of obstacles) {
    const dx = x - o.at[0];
    const dz = z - o.at[1];
    const d = Math.hypot(dx, dz);
    if (d >= o.radius || d === 0) continue;
    x = o.at[0] + (dx / d) * o.radius;
    z = o.at[1] + (dz / d) * o.radius;
  }
  return [x, z];
}

/** いちばん近い、話せる相手。範囲の外なら null */
export function nearestTarget(pos: Vec2, world: World, range = TALK_RANGE): Target | null {
  let best: { d: number; t: Target } | null = null;
  const consider = (at: Vec2, radius: number, t: Target) => {
    const d = Math.hypot(pos[0] - at[0], pos[1] - at[1]) - radius;
    if (d > range) return;
    if (!best || d < best.d) best = { d, t };
  };
  for (const npc of world.npcs) consider(npc.at, 0.5, { type: "npc", npc });
  for (const spot of world.spots) consider(spot.at, spot.radius, { type: "spot", spot });
  return best ? (best as { d: number; t: Target }).t : null;
}

/** JSON の座標はタイル単位。メートルに直した World を返す。道だけはタイル単位のまま */
export function inMeters(world: World): World {
  const t = world.meta.tile;
  const m = (v: Vec2): Vec2 => [v[0] * t, v[1] * t];
  return {
    ...world,
    meta: { ...world.meta, start: m(world.meta.start), island: { min: m(world.meta.island.min), max: m(world.meta.island.max) } },
    props: world.props.map((p) => ({ ...p, at: m(p.at) })),
    spots: world.spots.map((s) => ({ ...s, at: m(s.at) })),
    npcs: world.npcs.map((n) => ({ ...n, at: m(n.at) })),
  };
}

/** 島の縁から落ちないよう、内側 margin メートルに収める */
export function clampToIsland(pos: Vec2, island: { min: Vec2; max: Vec2 }, margin = 2): Vec2 {
  const x = Math.min(Math.max(pos[0], island.min[0] + margin), island.max[0] - margin);
  const z = Math.min(Math.max(pos[1], island.min[1] + margin), island.max[1] - margin);
  return [x, z];
}

export const clockText = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;
