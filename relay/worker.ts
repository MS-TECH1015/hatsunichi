// 確認役の中継。公開版の画面から、作者の鍵で Claude を呼べるようにする Cloudflare Worker。
// 受け取るのは scripts/review-server.ts の /sheet と同じ番号だけ。1 枚の文はこちらで world.json から組み直す。
//   POST /sheet     決めた 1 枚に付箋を付ける
//   POST /rehearse  市の担当者役の問い（返事の予行）
// 守り: Origin は ALLOWED_ORIGIN だけ。本文 4KB まで。同じ IP は 1 時間に 10 回まで。1 日の合計は DAILY_MAX 回まで。
// 回数は KV（HITS）に置く。鍵は wrangler secret put ANTHROPIC_API_KEY で入れ、コードにもリポジトリにも置かない。
// 置き方は docs/spec.md の 10 節
import world from "../data/world.json";
import { rehearseReply, reviewSheet } from "../src/lib/review";
import { answerFromRequest, type SheetRequest } from "../src/lib/sheet";
import type { World } from "../src/lib/world";

type KV = { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> };
type Env = { ANTHROPIC_API_KEY: string; HITS: KV; ALLOWED_ORIGIN?: string; DAILY_MAX?: string; REVIEW_MODEL?: string };

const BODY_MAX = 4096;
const PER_HOUR = 10;
const DEFAULT_DAILY = 200;
const w = world as unknown as World;

const json = (status: number, body: unknown, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", vary: "Origin" } });

/** KV の数を 1 つ増やして、上限を超えたかを返す。期限が来ると鍵ごと消える */
async function over(kv: KV, key: string, max: number, ttl: number): Promise<boolean> {
  const n = Number((await kv.get(key)) ?? "0") + 1;
  if (n > max) return true;
  await kv.put(key, String(n), { expirationTtl: ttl });
  return false;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = (env.ALLOWED_ORIGIN ?? "https://ms-tech1015.github.io").split(",").map((s) => s.trim());
    if (!allowed.includes(origin)) return new Response("origin", { status: 403 });
    if (req.method === "OPTIONS") return json(204, null, origin);
    const path = new URL(req.url).pathname;
    if (req.method !== "POST" || !["/sheet", "/rehearse"].includes(path)) return json(404, { error: "POST /sheet か POST /rehearse だけ" }, origin);
    if (Number(req.headers.get("content-length") ?? "0") > BODY_MAX) return json(413, { error: "本文が大きい" }, origin);

    const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    if (await over(env.HITS, `ip:${ip}:${Math.floor(Date.now() / 3600_000)}`, PER_HOUR, 3600)) return json(429, { error: "1 時間に 10 回まで" }, origin);
    if (await over(env.HITS, `day:${day}`, Number(env.DAILY_MAX ?? DEFAULT_DAILY), 2 * 86400)) return json(429, { error: "今日の分は使い切った" }, origin);

    const text = await req.text();
    if (text.length > BODY_MAX) return json(413, { error: "本文が大きい" }, origin);
    let input: SheetRequest;
    try {
      input = JSON.parse(text) as SheetRequest;
    } catch {
      return json(400, { error: "JSON でない" }, origin);
    }
    const answer = answerFromRequest(w, input);
    if (typeof answer === "string") return json(400, { error: answer }, origin);
    const opts = { apiKey: env.ANTHROPIC_API_KEY, model: env.REVIEW_MODEL };
    if (path === "/rehearse") return json(200, { reply: await rehearseReply(answer, w, opts) }, origin);
    return json(200, { note: await reviewSheet(answer, w, opts) }, origin);
  },
};
