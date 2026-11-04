// 確認役の手元サーバー。Pages は静的なので API を持てず、確認役はここで動かす。
// 使い方: node --env-file=.env scripts/review-server.ts
//   POST /review  作業台（/map）の提出用紙に付箋を付ける
//   POST /sheet   3D の町で決めた 1 枚に付箋を付ける
// 画面側は NEXT_PUBLIC_REVIEW_URL=http://localhost:8787/review で向ける。/sheet はその隣を使う
// 鍵を使うので、この PC の中からだけ受け付ける。ほかのサイトの画面からの呼び出しは断る
import { createServer, type IncomingMessage } from "node:http";
import town from "../data/town.json" with { type: "json" };
import world from "../data/world.json" with { type: "json" };
import { impactOf, residentState, type Town } from "../src/lib/impact.ts";
import { loadTickets } from "../src/lib/ticket.ts";
import { reviewSheet, reviewSubmission, type Facts, type Submission } from "../src/lib/review.ts";
import { answerFromRequest, type SheetRequest } from "../src/lib/sheet.ts";
import type { World } from "../src/lib/world.ts";

const PORT = Number(process.env.REVIEW_PORT ?? 8787);
const LIMIT_PER_HOUR = 10;
const BODY_MAX = 4096;
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const hits = new Map<string, number[]>();

type Reply = { status: number; body: unknown };

function overLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  hits.set(ip, recent);
  if (recent.length >= LIMIT_PER_HOUR) return true;
  recent.push(now);
  return false;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > BODY_MAX) throw new Error("大きすぎる");
  }
  return JSON.parse(raw);
}

async function reviewMap(input: unknown): Promise<Reply> {
  const body = input as { submission: Submission; load_factor?: number; ticket?: string };
  const t = town as unknown as Town;
  const removed = new Set(body.submission.removed.map((r) => r.trip_id));
  const load = body.load_factor ?? t.assumptions.load_factor_default;
  const impact = impactOf(t, removed, load);
  const facts: Facts = {
    persons: impact.persons,
    dots: impact.dots.length,
    load_factor: load,
    residents: t.residents.map((r) => ({ name: r.name, role: r.role, hour_band: r.hour_band, state: residentState(t, removed, r) })),
    weekday_trips: t.trips.length,
  };
  const tickets = loadTickets();
  const ticket = tickets.find((x) => x.file === body.ticket) ?? tickets[0];
  return { status: 200, body: { note: await reviewSubmission(ticket, facts, body.submission), facts } };
}

async function reviewTownSheet(input: unknown): Promise<Reply> {
  const w = world as unknown as World;
  const answer = answerFromRequest(w, input as SheetRequest);
  if (typeof answer === "string") return { status: 400, body: { error: answer } };
  return { status: 200, body: { note: await reviewSheet(answer, w) } };
}

const ROUTES: Record<string, (input: unknown) => Promise<Reply>> = { "/review": reviewMap, "/sheet": reviewTownSheet };

createServer(async (req, res) => {
  const origin = req.headers.origin;
  const local = origin !== undefined && LOCAL.test(origin);
  const headers = { "content-type": "application/json", ...(local ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", vary: "origin" } : {}) };
  const send = ({ status, body }: Reply) => res.writeHead(status, headers).end(JSON.stringify(body));

  if (origin !== undefined && !local) return send({ status: 403, body: { error: "この PC の画面からだけ受け付ける" } });
  if (req.method === "OPTIONS") return res.writeHead(204, headers).end();
  const route = req.method === "POST" ? ROUTES[req.url ?? ""] : undefined;
  if (!route) return send({ status: 404, body: { error: "POST /review か POST /sheet だけ" } });
  if (overLimit(req.socket.remoteAddress ?? "local")) return send({ status: 429, body: { error: "1時間に10回まで" } });

  let input: unknown;
  try {
    input = await readJson(req);
  } catch {
    return send({ status: 400, body: { error: `JSON で ${BODY_MAX} バイトまで` } });
  }
  try {
    send(await route(input));
  } catch (e) {
    console.error(e);
    send({ status: 502, body: { error: "確認役に届かなかった" } });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`確認役: http://localhost:${PORT}/review と /sheet  鍵 ${process.env.ANTHROPIC_API_KEY ? "あり" : "なし（demo）"}`));
