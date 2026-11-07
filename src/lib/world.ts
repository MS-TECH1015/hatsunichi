// 鳥取市の模型の型と、歩き回りの計算。three.js に依存しないので vitest で試せる。
// 座標は鳥取駅が原点、1 単位 = 50 m、+x が東、+z が南（scripts/build_city.py と同じ）
export type Vec2 = [number, number];

export type Note = { good: string; gap: string; question: string };
/** label は画面の選択肢に出す短い言い方。text は詳細と記録に残す言い方 */
/** checks は、依頼の場所の「まだ確かめていないこと」が案に合わないときだけ持つ */
export type Option = { text: string; label: string; note: Note; checks?: string[] };
export type Fact = { text: string; source: string };

/** 案に合う「まだ確かめていないこと」。案が持っていればそれ、無ければ依頼の場所のもの */
export function checksOf(spot: { checks: string[]; quest: { options: Option[] } }, option: string): string[] {
  return spot.quest.options.find((o) => o.text === option)?.checks ?? spot.checks;
}

/** 文の中の数字のうち、調べた数字に無いもの。1 桁と時刻は、案の中の決めごとに多いので拾わない。
 * 「三十人」のような漢数字と「3 割」も数にして比べ、名指しは書いたままの形で返す */
export function unsourcedNumbers(text: string, facts: Pick<Fact, "text">[]): string[] {
  const known = new Set(facts.flatMap((f) => numbersIn(f.text).map((n) => n.value)));
  const found = numbersIn(text).filter((n) => n.value.length > 1 && !known.has(n.value));
  return [...new Set(found.map((n) => n.raw))];
}

type Found = { raw: string; value: string };
// 漢数字は後ろに数え方が付くときだけ数とみる。「千代川」「十分」を拾わないため
const KANJI_NUMBER = /([〇一二三四五六七八九十百千万]+)(?=\s?(人|本|件|軒|年|か月|ヶ月|日|回|円|割|歳|台|戸|世帯|校|便|町丁|%))/g;
const DIGITS = "〇一二三四五六七八九";
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

function numbersIn(t: string): Found[] {
  const s = t.normalize("NFKC").replace(/(\d),(\d)/g, "$1$2");
  const found: Found[] = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(?![\d.]|\s?[時分])(\s?割)?/g)) {
    const value = m[2] ? String(Math.round(Number(m[1]) * 10000) / 1000) : m[1];
    found.push({ raw: m[2] ? m[0] : m[1], value });
  }
  for (const m of s.matchAll(KANJI_NUMBER)) {
    const share = m[2] === "割";
    const n = kanjiValue(m[1]) * (share ? 10 : 1);
    if (n >= 10) found.push({ raw: share ? `${m[1]}割` : m[1], value: String(n) });
  }
  return found;
}

/** 「三十」「二百五十」「千二百六十二」「二〇三〇」を数にする */
function kanjiValue(s: string): number {
  if (!/[十百千万]/.test(s)) return Number([...s].map((c) => DIGITS.indexOf(c)).join(""));
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const c of s) {
    if (DIGITS.includes(c)) {
      digit = DIGITS.indexOf(c);
      continue;
    }
    if (c === "万") {
      total += (section + digit || 1) * 10000;
      section = 0;
      digit = 0;
      continue;
    }
    section += (digit || 1) * UNITS[c];
    digit = 0;
  }
  return total + section + digit;
}
/** doing は窓口がすでにしていること。窓口のページを読んで、事実だけを自分の言葉で書いた */
export type Window = { name: string; url: string; checked: string; note: string; doing: string };
/** 市政提案に出た、依頼に近い過去の提案。題と日付はページのまま、回答は要旨を自分の言葉で書いた。updated はページの更新日で、回答の日ではない */
/** gap は、同じ話の提案が無く、近い話の 1 件を出すときに、何が無かったかを書く */
export type Heard = { gap?: string; title: string; received: string; updated: string; url: string; answer: string };

/** 物語を置く町。at は build_city.py が緯度経度から求めた位置。stop はバスに乗れる標識の位置（場所の中の座標） */
/** past はその町のむかし。公的な資料の事実を短く引いたもので、地元を探す画面で今の数字と並べる */
export type Place = { id: string; name: string; geo: Vec2; at: Vec2; hub?: boolean; stop?: Vec2; geo_source: string; past?: PastFact[] };

/** むかしの札に添える絵。写真は権利の確かめが要るので、作者が描いた絵だけを使う */
export const PAST_ICONS = ["doki", "kofun", "wan", "shiro", "yakusho", "fuda", "hina", "sakyu"] as const;
export type PastIcon = (typeof PAST_ICONS)[number];
/** era は資料にある時代だけを書く。資料に時代が無いものは空のまま */
export type PastFact = Fact & { era?: string; icon: PastIcon };

/** 題の画面と記録に出す、この模型にあるものの数。使った人の数はまだ無いので、代わりに中身の数を出す。
 * 町丁の人口は国勢調査の札の文から数える。札の無い町丁は入らない */
export function worldStats(world: World) {
  const people = world.marks.reduce((n, m) => n + (peopleOf(m.text) ?? 0), 0);
  const old = world.marks.reduce((n, m) => n + oldOf(m.text), 0);
  const change = world.marks.reduce((n, m) => n + changeOf(m.text), 0);
  const facts = world.spots.reduce((n, s) => n + s.facts.length, 0);
  return { towns: world.places.length, blocks: world.marks.length, people, oldShare: people ? Math.round((old / people) * 100) : 0, change, facts, sources: Object.keys(world.sources).length };
}

/** 主人公の位置からいちばん近い依頼の場所。done に入っている場所は除く。画面の案内に使う */
export function nearestSpot(pos: Vec2, spots: Spot[], done: Set<string>, places: Place[] = []): { spot: Spot; dx: number; dz: number; meters: number } | null {
  let best: { spot: Spot; dx: number; dz: number; meters: number } | null = null;
  const from = cityAt(places, pos);
  for (const spot of spots) {
    if (done.has(spot.id)) continue;
    const to = cityAt(places, spot.at);
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const meters = Math.hypot(dx, dz) * M_PER_UNIT;
    if (!best || meters < best.meters) best = { spot, dx, dz, meters };
  }
  return best;
}

/** 模型の 1 単位が実際の何 m か。scripts/build_city.py の M_PER_UNIT と同じ */
export const M_PER_UNIT = 50;

/** 1 枚に書く、その町の町丁に住む人の数。案が関わる人の規模を出典のある数で添える。65 歳以上の割合は人口で重みづけ。
 * change は 5 年の増減の合計で、減った町丁は負の数 */
export function placeStats(world: World, placeId: string) {
  let people = 0;
  let old = 0;
  let change = 0;
  let blocks = 0;
  const sources = new Set<string>();
  for (const m of world.marks) {
    if (m.place !== placeId) continue;
    const n = peopleOf(m.text);
    if (n === undefined) continue;
    blocks++;
    people += n;
    change += changeOf(m.text);
    old += oldOf(m.text);
    for (const s of m.sources) sources.add(s);
  }
  return { blocks, people, change, oldShare: people ? Math.round((old / people) * 100) : 0, sources: [...sources] };
}

/** 増減の数を文にする。札の文と同じ言い方にそろえる */
export function changeText(change: number): string {
  if (change === 0) return "5 年で変わらない";
  return `5 年で ${Math.abs(change).toLocaleString()} 人${change < 0 ? "減った" : "増えた"}`;
}

function peopleOf(text: string): number | undefined {
  const hit = text.match(/住む人 ([\d,]+) 人/);
  return hit ? Number(hit[1].replace(/,/g, "")) : undefined;
}

/** 65 歳以上の人数。割合は整数の % なので、人数は近い値 */
function oldOf(text: string): number {
  const n = peopleOf(text) ?? 0;
  return (n * (Number(text.match(/65歳以上が (\d+)%/)?.[1]) || 0)) / 100;
}

function changeOf(text: string): number {
  const hit = text.match(/5年で ([\d,]+) 人(減った|増えた)/);
  if (!hit) return 0;
  const n = Number(hit[1].replace(/,/g, ""));
  return hit[2] === "減った" ? -n : n;
}

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
  /** 案を出したあと、頼んだ人が本人に聞く一問。自分ならどこまでするか。答えは 1 枚の「自分は」の行に載る */
  self?: { ask: string; options: string[] };
  window: Window;
  heard?: Heard;
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
  /** セリフの数字の出典（sources の id）。人は作り話で、数字だけが資料から */
  src?: string;
  /** 話したあと、案を考える画面に並ぶ、この人の立場の一言 */
  view?: string;
};

export type Prop = { place: string; kind: string; at: Vec2; face: number; scale?: number };

/** 町丁の印。近くを歩くと、人口と近い病院・小学校までの距離が手帳に残る。at は場所の中の座標。scripts/build_marks.py が作る */
export type Mark = { id: string; place: string; at: Vec2; text: string; sources: string[]; /** 実在の町の円より外にあり、市の地図の上に置く */ city?: boolean };

/** 鳥取市の未活用施設。近くを通ると手帳に入り、案を出すときに「使う場所」として選べる。scripts/build_facilities.py が作る */
export type Facility = Mark & { name: string; /** 空き家バンクの物件のときだけ。登録中・移住向け・成約済み */ akiya?: AkiyaStatus; url?: string | null };
export type AkiyaStatus = "listed" | "uji" | "closed";
/** 鳥取市 空き家情報バンクの物件（scripts/build_akiya.py）。at は町名の代表点で、家の位置ではない。real は実在の町の中での位置 */
export type Akiya = { id: string; status: AkiyaStatus; town: string; geo: Vec2; at: Vec2; url: string | null; sources: string[]; real?: { place: string; at: Vec2 } };

export type World = {
  /** 国勢調査 令和2年の鳥取市全体。oldShare は年齢の分かる人のうち 65 歳以上の割合 */
  cityAge: { people: number; oldShare: number };
  meta: { start: { place: string; at: Vec2 }; clock: { start_hour: number; end_hour: number; minutes_per_second: number; minutes_per_talk: number } };
  places: Place[];
  props: Prop[];
  spots: Spot[];
  marks: Mark[];
  facilities: Facility[];
  akiya?: Akiya[];
  npcs: Npc[];
  sources: Record<string, { name: string; url: string; date: string; note: string }>;
  /** 案を出す先。担当の窓口は問い合わせ先で、提案を受けて回答すると書いてあるのはここだけ */
  /** 解く課題の数字。題の画面と白兎の初日の説明に出す */
  problem: Fact[];
  submit: { name: string; url: string; reply: string; listed: { text: string; source: string }; source: string };
  /** 案を市に出さず、事業の構想として持ち帰る人の相談先。合う制度があるかまでは確かめていない */
  business: { name: string; url: string; note: string; source: string };
};

/** 場所の中の座標を、市全体の座標に直したもの */
export type Placed = World & { start: Vec2; stops: { place: Place; at: Vec2 }[] };

export type Target = { type: "spot"; spot: Spot } | { type: "npc"; npc: Npc } | { type: "bus"; place: Place; at: Vec2 };

/** 地形の格子。height は高さ×100 の整数、mask は 1 歩ける / 2 市内 / 4 水 */
export type Ground = { x0: number; z0: number; cell: number; w: number; h: number; height: Int16Array; mask: Uint8Array };
export type Route = { km: number; path: Vec2[] };

export const TALK_RANGE = 2.2;
/** 町丁の印を拾う距離（単位）。家に押し出されても届くよう、家の半径より少し広い */
export const MARK_RANGE = 3;
export const PROP_RADIUS: Record<string, number> = { house: 2.4, house_b: 2.4, shop: 2.4, pear_tree: 0.6, field: 4.2, school: 5.2, tree: 0.9, pole: 0.3, vending: 0.7, bench: 0.8, hill: 9 };
/** 路線バスの平均の速さ [推定: 停車を含めて時速 25 km と置いた] */
export const BUS_KMH = 25;

/** PLATEAU の建物がある町。町の中は実在の建物・道の形（public/city/towns/<町>.json）で、
 * 市の地図から離れた所に 1 単位 1.5 m で置く。バスで着くとそこへ移る。ほかの町は市の地図の上の模型のまま */
export const REAL_TOWNS = ["eki", "kumoyama", "koyama", "kawahara"];
export const REAL_M_PER_UNIT = 1.5;
const POCKET_SIZE = 3000;

/** 実在の町を置く所の原点。市の地図（中心から 500 単位ほど）からは霧で見えない */
export function pocketOrigin(id: string): Vec2 | null {
  const i = REAL_TOWNS.indexOf(id);
  return i < 0 ? null : [6000 + i * POCKET_SIZE, 6000];
}

/** その座標がどの実在の町の中か。市の地図の上なら null */
export function pocketAt(at: Vec2): string | null {
  return REAL_TOWNS.find((id) => {
    const o = pocketOrigin(id)!;
    return Math.abs(at[0] - o[0]) < POCKET_SIZE / 2 && Math.abs(at[1] - o[1]) < POCKET_SIZE / 2;
  }) ?? null;
}

/** 市の地図の座標へ直す。実在の町の中なら、その町の市の地図の位置へ縮める */
export function cityAt(places: Place[], at: Vec2): Vec2 {
  const id = pocketAt(at);
  const place = id ? places.find((p) => p.id === id) : undefined;
  if (!id || !place) return at;
  const o = pocketOrigin(id)!;
  const k = REAL_M_PER_UNIT / M_PER_UNIT;
  return [place.at[0] + (at[0] - o[0]) * k, place.at[1] + (at[1] - o[1]) * k];
}

const AKIYA_TEXT: Record<AkiyaStatus, (town: string) => string> = {
  listed: (t) => `空き家バンクに登録中の物件が${t}にある（市の一覧の 2026年10月16日 の時点）。印は町名の代表点で、家の位置ではない`,
  uji: (t) => `移住向けに紹介中の空き家が${t}にある（市の一覧の 2026年10月16日 の時点）。印は町名の代表点で、家の位置ではない`,
  closed: (t) => `空き家バンクで${t}の物件が成約した（同じ一覧の時点）。印は町名の代表点で、家の位置ではない`,
};

/** 空き家バンクの物件を、近づくと手帳に入る札にする。実在の町の中にあれば町の中に、なければ市の地図の上に置く */
function akiyaFacility(world: World, a: Akiya): Facility {
  const near = world.places.reduce((b, p) => (Math.hypot(p.at[0] - a.at[0], p.at[1] - a.at[1]) < Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) ? p : b));
  const o = a.real ? pocketOrigin(a.real.place) : null;
  const at: Vec2 = a.real && o ? [o[0] + a.real.at[0], o[1] + a.real.at[1]] : a.at;
  return { id: a.id, place: a.real?.place ?? near.id, at, name: `空き家バンク ${a.town}`, text: AKIYA_TEXT[a.status](a.town), sources: a.sources, akiya: a.status, url: a.url };
}

export function placeWorld(world: World): Placed {
  const at = new Map(world.places.map((p) => [p.id, pocketOrigin(p.id) ?? p.at]));
  const city = new Map(world.places.map((p) => [p.id, p.at]));
  // city が付いた物は、実在の町の円より外にあるので市の地図の上に置く
  const shift = (place: string, v: Vec2, onCity = false): Vec2 => {
    const base = (onCity ? city : at).get(place);
    if (!base) throw new Error(`場所が無い: ${place}`);
    return [base[0] + v[0], base[1] + v[1]];
  };
  return {
    ...world,
    start: shift(world.meta.start.place, world.meta.start.at),
    props: world.props.map((p) => ({ ...p, at: shift(p.place, p.at) })),
    spots: world.spots.map((s) => ({ ...s, at: shift(s.place, s.at) })),
    marks: world.marks.map((m) => ({ ...m, at: shift(m.place, m.at, m.city) })),
    facilities: [...world.facilities.map((f) => ({ ...f, at: shift(f.place, f.at, f.city) })), ...(world.akiya ?? []).map((a) => akiyaFacility(world, a))],
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

/** いちばん近い町丁の印。範囲の外なら null */
export function nearestMark<T extends { at: Vec2 }>(pos: Vec2, marks: T[], range = MARK_RANGE): T | null {
  let best: T | null = null;
  let bestD = range;
  for (const m of marks) {
    const d = Math.hypot(pos[0] - m.at[0], pos[1] - m.at[1]);
    if (d > bestD) continue;
    best = m;
    bestD = d;
  }
  return best;
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
export type Find = { id: string; text: string; source: string; spot?: string; place?: string; url?: string };

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

export function markFind(mark: Mark, sources: World["sources"]): Find {
  return { id: `mark:${mark.id}`, text: mark.text, source: mark.sources.map((k) => sources[k]?.name ?? k).join(" / "), place: mark.place };
}

export function facilityFind(f: Facility, sources: World["sources"]): Find {
  return { ...markFind(f, sources), id: `fac:${f.id}`, ...(f.url ? { url: f.url } : {}) };
}
