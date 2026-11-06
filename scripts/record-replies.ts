// 返事の予行の記録。依頼の場所ごとの案 × 根拠の全部を、市の担当者役の Claude に読ませ、聞き返す問いを記録する。
// 鍵の無い人に終業の画面で見せるためのもの。見るのは、問いに 1 枚に無い数字が残らないか、書き直しの回数。
// 使い方: npm run record:replies （.env があれば読む。REVIEW_MODEL と ANTHROPIC_API_KEY は環境変数。RECORD=1 で data/replies-recorded.json を書く）
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import raw from "../data/world.json" with { type: "json" };
import { rehearseReply, replyNumbers } from "../src/lib/review.ts";
import { answerFromRequest, sheetOf, type SheetAnswer, type SheetRequest } from "../src/lib/sheet.ts";
import type { World } from "../src/lib/world.ts";

const w = raw as unknown as World;
const cases: { name: string; req: SheetRequest }[] = w.spots.flatMap((s) =>
  s.quest.options.flatMap((o, i) => s.facts.map((_, f) => ({ name: `${s.title} / ${o.label} / 根拠 ${f + 1}`, req: { spot: s.id, option: i, fact: f } }))),
);

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const model = process.env.ANTHROPIC_API_KEY ? (process.env.REVIEW_MODEL ?? "claude-opus-5-5") : "demo";
const cell = (s: string) => s.replace(/\|/g, "／");
const replies: Record<string, { asks: string[] }> = {};
const rows: string[] = [];
let leaked = 0;
let retries = 0;

// ONLY=stop:2,field1:2 なら、その案だけ Claude に読ませ、ほかの案は前の記録を使う。1 枚を少し直したときに API を呼びすぎないため
const only = process.env.ONLY?.split(",").filter(Boolean);
const prev = only ? (JSON.parse(readFileSync("data/replies-recorded.json", "utf8")) as { replies: Record<string, { asks: string[] }> }).replies : {};
const keyOf = (c: (typeof cases)[number]) => `${c.req.spot}:${c.req.option}:${c.req.fact}`;
const fresh = cases.filter((c) => !only || only.some((o) => keyOf(c).startsWith(`${o}:`)) || !prev[keyOf(c)]);
// 4 件ずつ同時に送る。1 件ずつだと 81 件で 20 分を超えるため
const ran = await Promise.all(
  cases.map(async (c) => {
    const a = answerFromRequest(w, c.req) as SheetAnswer;
    const i = fresh.indexOf(c);
    if (i < 0) {
      const reply = { asks: prev[keyOf(c)].asks, model, retries: 0, demo: false };
      return { c, reply, bad: replyNumbers(reply, sheetOf(a, w, "city")) };
    }
    await new Promise((r) => setTimeout(r, (i % 4) * 1500 + Math.floor(i / 4) * 6000));
    const reply = await rehearseReply(a, w);
    const bad = replyNumbers(reply, sheetOf(a, w, "city"));
    return { c, reply, bad };
  }),
);
for (const { c, reply, bad } of ran) {
  leaked += bad.length > 0 ? 1 : 0;
  retries += reply.retries;
  if (bad.length === 0) replies[`${c.req.spot}:${c.req.option}:${c.req.fact}`] = { asks: reply.asks };
  rows.push(`| ${c.name} | ${reply.retries} | ${bad.join("、") || "なし"} | ${cell(reply.asks.join(" ／ "))} |`);
}

const md = [
  `# 返事の予行の記録（市の担当者役）: ${model}`,
  "",
  model === "demo" ? "鍵が無いので demo の問いで通した。Claude の測定はしていない。" : `${today}、${cases.length} 件。問いに 1 枚に無い数字が残った件 ${leaked}、書き直しの合計 ${retries} 回。実在の市の返事ではない。`,
  "",
  "| 件 | 書き直し | 問いに残った 1 枚に無い数字 | 担当者役の問い |",
  "|---|---|---|---|",
  ...rows,
  "",
].join("\n");
mkdirSync("docs/eval", { recursive: true });
const out = `docs/eval/reply-${model}.md`;
writeFileSync(out, md);
console.log(`書いた: ${out}`);
if (model !== "demo" && process.env.RECORD) {
  writeFileSync("data/replies-recorded.json", JSON.stringify({ model, date: today, summary: { cases: cases.length, leaked, retries }, replies }, null, 2) + "\n");
  console.log(`書いた: data/replies-recorded.json（${Object.keys(replies).length} 件）`);
}
console.log(md.split("\n")[2]);
