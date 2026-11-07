// 使う人が選んだ町丁から、近い空き家・未活用施設・バス停を出す。選んだ町丁はその人のブラウザの中でだけ使い、どこにも送らない。
import { cityAt, M_PER_UNIT, type AkiyaStatus, type Place, type Placed, type Vec2 } from "./world";

/** public/city/near.json（scripts/build_near.py）。座標は市の地図（1 単位 50 m） */
export type NearData = { chome: [string, number, number][]; stops: [string, number, number, number][] };

/** 歩く速さの目安。不動産の広告で使う 1 分 80 m（推定。坂と信号は入れていない） */
export const WALK_M_PER_MIN = 80;

export type Near = { name: string; m: number; minutes: number };
export type NearMe = {
  chome: string;
  at: Vec2;
  akiya: (Near & { status: AkiyaStatus; url: string | null })[];
  facility: Near | null;
  stop: (Near & { perDay: number }) | null;
  place: Place;
};

function near(from: Vec2, name: string, at: Vec2): Near {
  const m = Math.round(Math.hypot(at[0] - from[0], at[1] - from[1]) * M_PER_UNIT);
  return { name, m, minutes: Math.max(1, Math.round(m / WALK_M_PER_MIN)) };
}

const byM = (a: Near, b: Near) => a.m - b.m;

export function nearMe(chome: string, data: NearData, placed: Placed): NearMe | null {
  const hit = data.chome.find((c) => c[0] === chome);
  if (!hit) return null;
  const from: Vec2 = [hit[1], hit[2]];
  const akiya = placed.facilities
    .filter((f) => f.akiya && f.akiya !== "closed")
    .map((f) => ({ ...near(from, f.name, cityAt(placed.places, f.at)), status: f.akiya!, url: f.url ?? null }))
    .sort(byM)
    .slice(0, 3);
  const facility = placed.facilities
    .filter((f) => !f.akiya)
    .map((f) => near(from, f.name, cityAt(placed.places, f.at)))
    .sort(byM)[0] ?? null;
  const stop = data.stops.map((s) => ({ ...near(from, s[0], [s[1], s[2]]), perDay: s[3] })).sort(byM)[0] ?? null;
  const place = placed.places.reduce((b, p) => (Math.hypot(p.at[0] - from[0], p.at[1] - from[1]) < Math.hypot(b.at[0] - from[0], b.at[1] - from[1]) ? p : b));
  return { chome, at: from, akiya, facility, stop, place };
}

/** 1 枚に足す「自分だから出せる理由」。target は使う場所の市の地図の座標。画面の中の写しにだけ載せ、確認役には送らない */
export function nearLine(me: NearMe, target: Vec2 | null): string {
  if (!target) return `提案者は${me.chome}に住んでいる`;
  return `提案者は${me.chome}に住んでいて、ここまでまっすぐ測って ${km(near(me.at, "", target).m)}`;
}

export function km(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}
