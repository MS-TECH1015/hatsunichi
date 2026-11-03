// POST /api/review: 提出用紙を受け取り、確認役の付箋を返す。鍵が無ければ demo の付箋。
import { NextResponse } from "next/server";
import town from "../../../../data/town.json";
import { impactOf, residentState, type Town } from "@/lib/impact";
import { loadTickets } from "@/lib/ticket";
import { reviewSubmission, type Facts, type Submission } from "@/lib/review";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (overLimit(ip)) return NextResponse.json({ error: "1時間に10回まで" }, { status: 429 });

  const body = (await req.json()) as { submission: Submission; load_factor?: number };
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
  const note = await reviewSubmission(loadTickets()[0], facts, body.submission);
  return NextResponse.json({ note, facts });
}
