// 鳥取市の模型の型と、歩き回りの計算。three.js に依存しないので vitest で試せる。
// 座標は鳥取駅が原点、1 単位 = 50 m、+x が東、+z が南（scripts/build_city.py と同じ）
export type Vec2 = [number, number];

export type Note = { good: string; gap: string; question: string };
/** label は画面の選択肢に出す短い言い方。text は詳細と記録に残す言い方 */
export type Option = { text: string; label: string; note: Note };
export type Fact = { text: string; source: string };

/** 文の中の数字のうち、調べた数字に無いもの。1 桁と時刻は、案の中の決めごとに多いので拾わない */
export function unsourcedNumbers(text: string, facts: Fact[]): string[] {
  const numbers = (t: string) => t.normalize("NFKC").replace(/(\d),(\d)/g, "$1$2").match(/\d+(\.\d+)?(?![\d.]|\s?[時分])/g) ?? [];
  const known = new Set(facts.flatMap((f) => numbers(f.text)));
  return [...new Set(numbers(text))].filter((n) => n.length > 1 && !known.has(n));
}
export type Window = { name: string; url: string; checked: string; note: string };

/** 物語を置く町。at は build_city.py が緯度経度から求めた位置。stop はバスに乗れる標識の位置（場所の中の座標） */
export type Place = { id: string; name: string; geo: Vec2; at: Vec2; hub?: boolean; stop?: Vec2; geo_source: string };

export type Spot = {
  id: string;
  place: string;
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
  /** write は自分の一行を書くときに案内役が投げる問い */
  quest: { ask: string; write: string; options: Option[] };
  /** 自分の案を窓口へ持っていく前に、本人が確かめる問い。正解を言わずに考える手がかりにする */
  checks: string[];
  window: Window;
  /** もっと深く解く画面。バス停なら地図の作業台 */
  deeper?: { label: string; href: string };
};

export type Npc = {
  id: string;
  place: string;
  kind: "person" | "rabbit";
  at: Vec2;
  face: number;
  name: string;
  role: string;
  body?: [number, number, number];
  hair?: [number, number, number];
  lines: string[];
  /** 話したあと、案を考える画面に並ぶ、この人の立場の一言 */
  view?: string;
};

export type Prop = { place: string; kind: string; at: Vec2; face: number; scale?: number };

export type World = {
  meta: { start: { place: string; at: Vec2 }; clock: { start_hour: number; end_hour: number; minutes_per_second: number; minutes_per_talk: number } };
  places: Place[];
  props: Prop[];
  spots: Spot[];
  npcs: Npc[];
  sources: Record<string, { name: string; url: string; date: string; note: string }>;
  /** 案を出す先。担当の窓口は問い合わせ先で、提案を受けて回答すると書いてあるのはここだけ */
  submit: { name: string; url: string; reply: string; source: string };
};

/** 場所の中の座標を、市全体の座標に直したもの */
export type Placed = World & { start: Vec2; stops: { place: Place; at: Vec2 }[] };

export type Target = { type: "spot"; spot: Spot } | { type: "npc"; npc: Npc } | { type: "bus"; place: Place; at: Vec2 };

/** 地形の格子。height は高さ×100 の整数、mask は 1 歩ける / 2 市内 / 4 水 */
export type Ground = { x0: number; z0: number; cell: number; w: number; h: number; height: Int16Array; mask: Uint8Array };
export type Route = { km: number; path: Vec2[] };

export const TALK_RANGE = 2.2;
export const PROP_RADIUS: Record<string, number> = { house: 2.4, house_b: 2.4, shop: 2.4, pear_tree: 0.6, field: 4.2, school: 5.2, tree: 0.9, pole: 0.3, vending: 0.7, bench: 0.8, hill: 9 };
/** 路線バスの平均の速さ [推定: 停車を含めて時速 25 km と置いた] */
export const BUS_KMH = 25;

export function placeWorld(world: World): Placed {
  const at = new Map(world.places.map((p) => [p.id, p.at]));
  const shift = (place: string, v: Vec2): Vec2 => {
    const base = at.get(place);
    if (!base) throw new Error(`場所が無い: ${place}`);
    return [base[0] + v[0], base[1] + v[1]];
  };
  return {
    ...world,
    start: shift(world.meta.start.place, world.meta.start.at),
    props: world.props.map((p) => ({ ...p, at: shift(p.place, p.at) })),
    spots: world.spots.map((s) => ({ ...s, at: shift(s.place, s.at) })),
    npcs: world.npcs.map((n) => ({ ...n, at: shift(n.place, n.at) })),
    stops: world.places.filter((p) => p.hub && p.stop).map((p) => ({ place: p, at: shift(p.id, p.stop!) })),
  };
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
export function nearestTarget(pos: Vec2, world: Placed, range = TALK_RANGE): Target | null {
  let best: { d: number; t: Target } | null = null;
  const consider = (at: Vec2, radius: number, t: Target) => {
    const d = Math.hypot(pos[0] - at[0], pos[1] - at[1]) - radius;
    if (d > range) return;
    if (!best || d < best.d) best = { d, t };
  };
  for (const npc of world.npcs) consider(npc.at, 0.5, { type: "npc", npc });
  for (const spot of world.spots) consider(spot.at, spot.radius, { type: "spot", spot });
  for (const s of world.stops) consider(s.at, 0.4, { type: "bus", place: s.place, at: s.at });
  return best ? (best as { d: number; t: Target }).t : null;
}

export const targetAt = (t: Target): Vec2 => (t.type === "spot" ? t.spot.at : t.type === "npc" ? t.npc.at : t.at);

/** 足もとの高さ。格子の4点から線形に補う */
export function heightAt(g: Ground, x: number, z: number): number {
  const fx = Math.min(Math.max((x - g.x0) / g.cell, 0), g.w - 1.001);
  const fz = Math.min(Math.max((z - g.z0) / g.cell, 0), g.h - 1.001);
  const q = Math.floor(fx);
  const r = Math.floor(fz);
  const tx = fx - q;
  const tz = fz - r;
  const h = (rr: number, qq: number) => g.height[rr * g.w + qq] / 100;
  const top = h(r, q) * (1 - tx) + h(r, q + 1) * tx;
  const bottom = h(r + 1, q) * (1 - tx) + h(r + 1, q + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

/** 歩ける所か。市の外・海・湖は歩けない */
export function walkable(g: Ground, x: number, z: number): boolean {
  const q = Math.round((x - g.x0) / g.cell);
  const r = Math.round((z - g.z0) / g.cell);
  if (q < 0 || r < 0 || q >= g.w || r >= g.h) return false;
  return (g.mask[r * g.w + q] & 1) === 1;
}

/** 歩けない所へは進まず、x か z の片方だけでも進めるなら壁に沿って滑る */
export function stepWithin(g: Ground, from: Vec2, to: Vec2): Vec2 {
  if (walkable(g, to[0], to[1])) return to;
  if (walkable(g, to[0], from[1])) return [to[0], from[1]];
  if (walkable(g, from[0], to[1])) return [from[0], to[1]];
  return from;
}

/** 2 つの場所を結ぶバスの経路。キーは id を辞書順に並べた "a|b"。逆向きなら道を裏返す */
export function routeBetween(routes: Record<string, Route>, from: string, to: string): Route | null {
  const key = from < to ? `${from}|${to}` : `${to}|${from}`;
  const r = routes[key];
  if (!r) return null;
  return from < to ? r : { km: r.km, path: [...r.path].reverse() };
}

export const busMinutes = (km: number) => Math.round((km / BUS_KMH) * 60);

export const clockText = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.floor(minutes % 60)).padStart(2, "0")}`;

/** 歩いて見つけたこと。text の数字は source の出典に戻れる。spot は依頼の場所で見つけたときの依頼 id */
export type Find = { id: string; text: string; source: string; spot?: string; place?: string };

/** 緯度経度 2 点の直線距離 km。地球を半径 6371 km の球として計算する */
export function straightKm([lat1, lon1]: Vec2, [lat2, lon2]: Vec2): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** 依頼の場所に近づいたときに残す 1 行。その依頼の最初の数字を使う */
export function spotFind(spot: Spot, sources: World["sources"]): Find {
  const f = spot.facts[0];
  return { id: `spot:${spot.id}`, text: `${spot.title}。${f.text}`, source: sources[f.source]?.name ?? f.source, spot: spot.id, place: spot.place };
}

/** バスで町を移ったときに残す 1 行。走った道の長さでなく、まっすぐの距離で近さを見せる */
export function rideFind(from: Place, to: Place): Find {
  const km = straightKm(from.geo, to.geo);
  return {
    id: `ride:${[from.id, to.id].sort().join("|")}`,
    text: `${from.name}から${to.name}まで、まっすぐなら ${km < 10 ? km.toFixed(1) : Math.round(km)} km`,
    source: `${from.geo_source} と ${to.geo_source} の緯度経度`,
  };
}
