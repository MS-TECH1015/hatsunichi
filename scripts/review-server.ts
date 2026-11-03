// 確認役の手元サーバー。Pages は静的なので API を持てず、確認役はここで動かす。
// 使い方: node scripts/review-server.ts  → http://localhost:8787/review に POST
// 画面側は NEXT_PUBLIC_REVIEW_URL=http://localhost:8787/review で向ける
import { createServer } from "node:http";
import town from "../data/town.json" with { type: "json" };
import { impactOf, residentState, type Town } from "../src/lib/impact.ts";
import { loadTickets } from "../src/lib/ticket.ts";
import { reviewSubmission, type Facts, type Submission } from "../src/lib/review.ts";

const PORT = Number(process.env.REVIEW_PORT ?? 8787);
const LIMIT_PER_HOUR = 10;
const hits = new Map<string, number[]>();

function overLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  hits.set(ip, recent);
  if (recent.length >= LIMIT_PER_HOUR) return true;
  recent.push(now);
  return false;
}

const headers = { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return res.writeHead(204, headers).end();
  if (req.method !== "POST" || req.url !== "/review") return res.writeHead(404, headers).end(JSON.stringify({ error: "POST /review だけ" }));
  if (overLimit(req.socket.remoteAddress ?? "local")) return res.writeHead(429, headers).end(JSON.stringify({ error: "1時間に10回まで" }));

  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw) as { submission: Submission; load_factor?: number; ticket?: string };
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
  const note = await reviewSubmission(ticket, facts, body.submission);
  res.writeHead(200, headers).end(JSON.stringify({ note, facts }));
}).listen(PORT, () => console.log(`確認役: http://localhost:${PORT}/review  鍵 ${process.env.ANTHROPIC_API_KEY ? "あり" : "なし（demo）"}`));
