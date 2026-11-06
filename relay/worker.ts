// 確認役の中継。公開版の画面から、作者の鍵で Claude を呼べるようにする Cloudflare Worker。
// 受け取るのは scripts/review-server.ts の /sheet と同じ番号だけ。1 枚の文はこちらで world.json から組み直す。
//   POST /sheet     決めた 1 枚に付箋を付ける
//   POST /rehearse  市の担当者役の問い（返事の予行）
//   POST /route     困りごとの一行から近い依頼を選ぶ。受け取るのは { text } だけで、OWN_MAX 字まで
// 守り: 日本からだけ（Anthropic の対応地域の規定に合わせる）。Origin は ALLOWED_ORIGIN だけ。本文 4KB まで。同じ IP は 1 時間に 10 回まで。1 日の合計は DAILY_MAX 回まで。
// プロンプトはこちらで組む。受け取った番号と一行をそのまま Claude に渡す口は作らない。モデルと出力の長さも src/lib/review.ts で決めてある。
// 回数は KV（HITS）に置く。鍵は wrangler secret put ANTHROPIC_API_KEY で入れ、コードにもリポジトリにも置かない。
// 置き方は docs/spec.md の 10 節
import world from "../data/world.json";
import { rehearseReply, reviewSheet, routeConcern } from "../src/lib/review";
import { OWN_MAX, answerFromRequest, type SheetRequest } from "../src/lib/sheet";
import type { World } from "../src/lib/world";

type KV = { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> };
type Env = { ANTHROPIC_API_KEY: string; HITS: KV; ALLOWED_ORIGIN?: string; DAILY_MAX?: string; REVIEW_MODEL?: string };

const BODY_MAX = 4096;
const PER_HOUR = 10;
const DEFAULT_DAILY = 100;
const w = world as unknown as World;

const json = (status: number, body: unknown, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", vary: "Origin" } });

const hits = async (kv: KV, key: string) => Number((await kv.get(key)) ?? "0");

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = (env.ALLOWED_ORIGIN ?? "https://ms-tech1015.github.io").split(",").map((s) => s.trim());
    if (!allowed.includes(origin)) return new Response("origin", { status: 403 });
    if (req.method === "OPTIONS") return json(204, null, origin);
    const path = new URL(req.url).pathname;
    if (req.method !== "POST" || !["/sheet", "/rehearse", "/route"].includes(path)) return json(404, { error: "POST /sheet・/rehearse・/route だけ" }, origin);
    if (Number(req.headers.get("content-length") ?? "0") > BODY_MAX) return json(413, { error: "本文が大きい" }, origin);

    // cf が無いのは手元の試験だけ
    const country = (req as Request & { cf?: { country?: string } }).cf?.country;
    if (country && country !== "JP") return json(403, { error: "日本からだけ使える" }, origin);

    // 断る回は KV に書かない。書くのは通した回の 2 件だけにして、無料枠の書き込み 1 日 1,000 回に収める
    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
    const ipKey = `ip:${ip}:${Math.floor(Date.now() / 3600_000)}`;
    const dayKey = `day:${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}`;
    const [byIp, byDay] = await Promise.all([hits(env.HITS, ipKey), hits(env.HITS, dayKey)]);
    if (byIp >= PER_HOUR) return json(429, { error: "1 時間に 10 回まで" }, origin);
    if (byDay >= Number(env.DAILY_MAX ?? DEFAULT_DAILY)) return json(429, { error: "今日の分は使い切った" }, origin);
    await Promise.all([env.HITS.put(ipKey, String(byIp + 1), { expirationTtl: 3600 }), env.HITS.put(dayKey, String(byDay + 1), { expirationTtl: 2 * 86400 })]);

    const text = await req.text();
    if (text.length > BODY_MAX) return json(413, { error: "本文が大きい" }, origin);
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      return json(400, { error: "JSON でない" }, origin);
    }
    const opts = { apiKey: env.ANTHROPIC_API_KEY, model: env.REVIEW_MODEL };
    if (path === "/route") {
      const line = typeof (input as { text?: unknown })?.text === "string" ? (input as { text: string }).text.trim() : "";
      if (!line || line.length > OWN_MAX) return json(400, { error: `一行は 1〜${OWN_MAX} 字` }, origin);
      return json(200, { route: await routeConcern(line, w, opts) }, origin);
    }
    const answer = answerFromRequest(w, input as SheetRequest);
    if (typeof answer === "string") return json(400, { error: answer }, origin);
    if (path === "/rehearse") return json(200, { reply: await rehearseReply(answer, w, opts) }, origin);
    return json(200, { note: await reviewSheet(answer, w, opts) }, origin);
  },
};
