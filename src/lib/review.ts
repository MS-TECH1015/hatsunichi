// 確認役。提出用紙を読んで、良い点1・抜け1・問い1の付箋を返す。
// 数字は計算結果（facts）にあるものしか書けない。無い数字が混ざったら作り直させ、回数を記録する。
import Anthropic from "@anthropic-ai/sdk";
import type { Ticket } from "./ticket";

export type Submission = {
  removed: { trip_id: string; family: string; departure: string; headsign: string }[];
  reason: string;
  affected: string;
  alternative: string;
};

export type Facts = {
  persons: { low: number; mid: number; high: number };
  dots: number;
  load_factor: number;
  residents: { name: string; role: string; hour_band: string; state: string }[];
  weekday_trips: number;
};

export type Note = {
  good: string;
  gap: string;
  question: string;
  model: string;
  retries: number;
  demo: boolean;
};

const TOOL = {
  name: "submit_review",
  description: "提出用紙への付箋を出す。良い点1・抜け1・問い1。各1〜2文。",
  input_schema: {
    type: "object" as const,
    properties: {
      good: { type: "string", description: "良い点。用紙の行を名指しする" },
      gap: { type: "string", description: "抜け。計算結果や住民の状態と照らして足りない点を1つ" },
      question: { type: "string", description: "問い。次の提出で答えてほしいこと1つ" },
    },
    required: ["good", "gap", "question"],
  },
};

export const digitsOf = (text: string) => new Set(text.match(/\d+/g) ?? []);

// 時刻（0〜24時、分）は出典の要る数字ではない
export const CLOCK_DIGITS = Array.from({ length: 60 }, (_, i) => [String(i), String(i).padStart(2, "0")]).flat();

// 付箋の数字が facts と提出用紙のどちらにも無ければ、その数字を返す
export function unsourcedNumbers(note: Pick<Note, "good" | "gap" | "question">, facts: Facts, submission: Submission): string[] {
  const allowed = digitsOf(JSON.stringify(facts) + JSON.stringify(submission) + CLOCK_DIGITS.join(" "));
  const used = digitsOf(`${note.good} ${note.gap} ${note.question}`);
  return [...used].filter((n) => !allowed.has(n));
}

export function demoNote(facts: Facts, submission: Submission): Note {
  const first = submission.removed[0];
  const affected = facts.residents.find((r) => r.state === "affected");
  return {
    good: first
      ? `${first.departure} の ${first.family} を外す理由に、代替便の有無を書いている点は読み手に伝わる。`
      : "減らす便を選ぶ前に影響の幅を見ている。",
    gap: affected
      ? `${affected.name}（${affected.role}、${affected.hour_band}時台）が影響ありのまま。用紙の「影響を受ける人」にこの人が入っていない。`
      : `影響 ${facts.persons.low}〜${facts.persons.high}人の幅のうち、どちらを基準に書いたかが用紙に無い。`,
    question: `乗車率 ${facts.load_factor} は仮定の値。別の値にしたとき、この案は変わるか。`,
    model: "demo",
    retries: 0,
    demo: true,
  };
}

function prompt(ticket: Ticket, facts: Facts, submission: Submission, feedback?: string): string {
  return [
    "あなたは路線バスの減便案を受け取る担当者の先輩役。学生の提出用紙に付箋を1枚だけ付ける。",
    "守ること: 数字は下の facts と提出用紙にある数字だけを使う。新しい数字を作らない。点数・採点・ランキングの語を使わない。敬語で、短く。",
    "",
    `依頼票: 路線 ${ticket.route} ／ 依頼 ${ticket.request} ／ 条件 ${ticket.condition} ／ 期限 ${ticket.deadline}`,
    "",
    "facts（計算結果。LLM は作っていない）:",
    JSON.stringify(facts, null, 1),
    "",
    "提出用紙:",
    `減らす便: ${submission.removed.map((r) => `${r.departure} ${r.family}→${r.headsign}`).join("、") || "（未選択）"}`,
    `理由: ${submission.reason}`,
    `影響を受ける人: ${submission.affected}`,
    `代替案: ${submission.alternative}`,
    feedback ? `\n前回の付箋はやり直し。理由: ${feedback}` : "",
    "",
    "submit_review ツールで返す。",
  ].join("\n");
}

export async function reviewSubmission(ticket: Ticket, facts: Facts, submission: Submission): Promise<Note> {
  if (!process.env.ANTHROPIC_API_KEY) return demoNote(facts, submission);
  const client = new Anthropic();
  const model = process.env.REVIEW_MODEL ?? "claude-opus-5-5";
  let feedback: string | undefined;
  let last: Pick<Note, "good" | "gap" | "question"> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: 600,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "submit_review" },
      messages: [{ role: "user", content: prompt(ticket, facts, submission, feedback) }],
    });
    const call = res.content.find((c) => c.type === "tool_use");
    if (!call || call.type !== "tool_use") throw new Error("確認役がツールで返さなかった");
    last = call.input as Pick<Note, "good" | "gap" | "question">;
    const bad = unsourcedNumbers(last, facts, submission);
    if (bad.length === 0) return { ...last, model, retries: attempt, demo: false };
    feedback = `facts に無い数字 ${bad.join("、")} が入っていた。facts と提出用紙の数字だけを使う`;
  }
  // 3回とも通らなければ、数字を伏せて返す
  const scrub = (s: string) => s.replace(/\d+/g, "〔数字は出典に戻れないので伏せた〕");
  return { good: scrub(last!.good), gap: scrub(last!.gap), question: scrub(last!.question), model, retries: 3, demo: false };
}
