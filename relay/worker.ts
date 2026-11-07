// 確認役の中継。公開版の画面から、作者の鍵で Claude を呼べるようにする Cloudflare Worker。
// 受け取るのは scripts/review-server.ts の /sheet と同じ番号だけ。1 枚の文はこちらで world.json から組み直す。
//   POST /sheet     決めた 1 枚に付箋を付ける
//   POST /rehearse  市の担当者役の問い（返事の予行）
//   POST /route     困りごとの一行から近い依頼を選ぶ。受け取るのは { text } だけで、OWN_MAX 字まで
//   GET・POST /made 作られた 1 枚の合計を返す・1 足す。中身は受け取らない。同じ IP は 1 時間に 20 回まで数える
// 守り: 日本からだけ（Anthropic の対応地域の規定に合わせる）。Origin は ALLOWED_ORIGIN だけ。本文 4KB まで。同じ IP は 1 時間に PER_HOUR 回まで（既定 10、置いた先は 30。人前で何度も見せる日に足りるように）。1 日の合計は DAILY_MAX 回まで。
// プロンプトはこちらで組む。受け取った番号と一行をそのまま Claude に渡す口は作らない。モデルと出力の長さも src/lib/review.ts で決めてある。
// 回数は KV（HITS）に置く。鍵は wrangler secret put ANTHROPIC_API_KEY で入れ、コードにもリポジトリにも置かない。
// 置き方は docs/spec.md の 10 節
import world from "../data/world.json";
import { rehearseReply, reviewSheet, routeConcern } from "../src/lib/review";
import { OWN_MAX, answerFromRequest, type SheetRequest } from "../src/lib/sheet";
import type { World } from "../src/lib/world";

type KV = { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> };
type Env = { ANTHROPIC_API_KEY: string; HITS: KV; ALLOWED_ORIGIN?: string; DAILY_MAX?: string; PER_HOUR?: string; REVIEW_MODEL?: string };

const BODY_MAX = 4096;
const DEFAULT_PER_HOUR = 10;
const DEFAULT_DAILY = 100;
/** 前の答えを残す日数。置くのは問いの SHA-256 と Claude の答えだけで、書いた一行そのものは鍵にしない */
const CACHE_TTL = 14 * 86400;
const w = world as unknown as World;

const cors = (origin: string) => ({ "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "Origin" });
const json = (status: number, body: unknown, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(origin) } });

const hits = async (kv: KV, key: string) => Number((await kv.get(key)) ?? "0");

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = (env.ALLOWED_ORIGIN ?? "https://ms-tech1015.github.io").split(",").map((s) => s.trim());
    if (!allowed.includes(origin)) return new Response("origin", { status: 403 });
    // 204 は本文を持てない。本文を付けると Workers が例外を投げ、ブラウザの事前確認が通らない
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const path = new URL(req.url).pathname;
    if (path === "/made") return made(req, env, origin);
    if (req.method !== "POST" || !["/sheet", "/rehearse", "/route"].includes(path)) return json(404, { error: "POST /sheet・/rehearse・/route だけ" }, origin);
    if (Number(req.headers.get("content-length") ?? "0") > BODY_MAX) return json(413, { error: "本文が大きい" }, origin);

    // cf が無いのは手元の試験だけ
    const country = (req as Request & { cf?: { country?: string } }).cf?.country;
    if (country && country !== "JP") return json(403, { error: "日本からだけ使える" }, origin);

    const text = await req.text();
    if (text.length > BODY_MAX) return json(413, { error: "本文が大きい" }, origin);
    const asked = askOf(path, text);
    if (typeof asked === "string") return json(400, { error: asked }, origin);

    // 同じ問いには前の答えを返し、Claude を呼ばない。数えもしないので、撮り直しや同じ例を試す人は回数を使わない
    const cacheKey = `ans:${await sha256(`${path}
${env.REVIEW_MODEL ?? ""}
${asked.key}`)}`;
    const cached = await env.HITS.get(cacheKey);
    if (cached) return json(200, JSON.parse(cached), origin);

    // 断る回は KV に書かない。書くのは通した回の 3 件だけにして、無料枠の書き込み 1 日 1,000 回に収める
    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
    const ipKey = `ip:${ip}:${Math.floor(Date.now() / 3600_000)}`;
    const dayKey = `day:${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`;
    const [byIp, byDay] = await Promise.all([hits(env.HITS, ipKey), hits(env.HITS, dayKey)]);
    const perHour = Number(env.PER_HOUR ?? DEFAULT_PER_HOUR);
    if (byIp >= perHour) return json(429, { error: `1 時間に ${perHour} 回まで` }, origin);
    if (byDay >= Number(env.DAILY_MAX ?? DEFAULT_DAILY)) return json(429, { error: "今日の分は使い切った" }, origin);
    await Promise.all([env.HITS.put(ipKey, String(byIp + 1), { expirationTtl: 3600 }), env.HITS.put(dayKey, String(byDay + 1), { expirationTtl: 2 * 86400 })]);

    const body = await asked.run({ apiKey: env.ANTHROPIC_API_KEY, model: env.REVIEW_MODEL });
    await env.HITS.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL });
    return json(200, body, origin);
  },
};

/** 作られた 1 枚の数。数えるのは合計だけで、1 枚の中身・町・書いた一行は受け取らない。
 * 同じ IP から 1 時間に MADE_PER_HOUR 回より多くは数えず、数を水増ししにくくする。KV は同時の書き込みで 1 回落とすことがあるので、数はおおよそ */
const MADE_PER_HOUR = 20;
const MADE_KEY = "made:total";
async function made(req: Request, env: Env, origin: string): Promise<Response> {
  if (req.method === "GET") return json(200, { total: await hits(env.HITS, MADE_KEY) }, origin);
  if (req.method !== "POST") return json(404, { error: "GET か POST /made だけ" }, origin);
  const country = (req as Request & { cf?: { country?: string } }).cf?.country;
  if (country && country !== "JP") return json(403, { error: "日本からだけ数える" }, origin);
  const ipKey = `made-ip:${req.headers.get("cf-connecting-ip") ?? "unknown"}:${Math.floor(Date.now() / 3600_000)}`;
  const [byIp, total] = await Promise.all([hits(env.HITS, ipKey), hits(env.HITS, MADE_KEY)]);
  if (byIp >= MADE_PER_HOUR) return json(200, { total }, origin);
  await Promise.all([env.HITS.put(ipKey, String(byIp + 1), { expirationTtl: 3600 }), env.HITS.put(MADE_KEY, String(total + 1))]);
  return json(200, { total: total + 1 }, origin);
}

type Opts = { apiKey: string; model?: string };
type Asked = { key: string; run: (opts: Opts) => Promise<unknown> };

/** 本文を確かめ、Claude に渡す前の形にする。断るときは理由の文を返す。回数を数える前に済ませ、壊れた本文で枠を使わせない */
function askOf(path: string, text: string): Asked | string {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return "JSON でない";
  }
  if (path === "/route") {
    const line = typeof (input as { text?: unknown })?.text === "string" ? (input as { text: string }).text.trim() : "";
    if (!line || line.length > OWN_MAX) return `一行は 1〜${OWN_MAX} 字`;
    return { key: line, run: async (opts) => ({ route: await routeConcern(line, w, opts) }) };
  }
  const answer = answerFromRequest(w, input as SheetRequest);
  if (typeof answer === "string") return answer;
  const key = JSON.stringify(input);
  if (path === "/rehearse") return { key, run: async (opts) => ({ reply: await rehearseReply(answer, w, opts) }) };
  return { key, run: async (opts) => ({ note: await reviewSheet(answer, w, opts) }) };
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
