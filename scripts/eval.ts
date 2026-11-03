// 確認役の測定。提出用紙4種 × 減らし方5種 = 20件と、同じ1件を10回。
// 鍵が無ければ demo の付箋で通し、測定ができないことを結果に書く。
// 使い方: node scripts/eval.ts  （REVIEW_MODEL と ANTHROPIC_API_KEY は環境変数）
import { writeFileSync, mkdirSync } from "node:fs";
import town from "../data/town.json" with { type: "json" };
import { impactOf, residentState, type Town, type Trip } from "../src/lib/impact.ts";
import { loadTickets } from "../src/lib/ticket.ts";
import { reviewSubmission, unsourcedNumbers, type Facts, type Note, type Submission } from "../src/lib/review.ts";

const t = town as unknown as Town;
const ticket = loadTickets()[0];
const byHour = (h: string, family: string) => t.trips.filter((x) => x.family === family && x.departure.startsWith(h));

const REMOVALS: { name: string; trips: Trip[] }[] = [
  { name: "9時台を1便", trips: byHour("09", "雲山市立病院線").slice(0, 1) },
  { name: "9時台を3便（条件に触れる）", trips: byHour("09", "雲山市立病院線").slice(0, 3) },
  { name: "早朝を1便", trips: t.trips.filter((x) => x.family === "雲山市立病院線").slice(0, 1) },
  { name: "夕方を3便", trips: [...byHour("17", "雲山市立病院線"), ...byHour("18", "雲山市立病院線")].slice(0, 3) },
  { name: "別路線を3便", trips: t.trips.filter((x) => x.family === "津ノ井若葉台循環線").slice(0, 3) },
];

function factsOf(trips: Trip[]): Facts {
  const removed = new Set(trips.map((x) => x.trip_id));
  const load = t.assumptions.load_factor_default;
  const impact = impactOf(t, removed, load);
  return {
    persons: impact.persons,
    dots: impact.dots.length,
    load_factor: load,
    residents: t.residents.map((r) => ({ name: r.name, role: r.role, hour_band: r.hour_band, state: residentState(t, removed, r) })),
    weekday_trips: t.trips.length,
  };
}

// 提出用紙4種。数字は facts から入れるので「正しい」提出
const SHEETS: ((f: Facts, trips: Trip[]) => Omit<Submission, "removed">)[] = [
  (f) => ({ reason: "本数の多い時間帯から減らす", affected: `計算では ${f.persons.low}〜${f.persons.high}人`, alternative: "前後の便に寄せる" }),
  (f) => ({ reason: "代替便が30分以内にある便を選んだ", affected: `灯った点は ${f.dots}。通院の人が中心`, alternative: "病院の受付時間に合わせて案内を出す" }),
  (f, trips) => ({ reason: `${trips.map((x) => x.departure).join("・")} は利用が少ないと見た`, affected: `${f.persons.mid}人前後。影響ありの住民はいない前提`, alternative: "無し。影響が小さいので据え置き" }),
  (f) => ({ reason: "依頼の条件を守りつつ3便に届く組み合わせ", affected: `${f.persons.low}人以上。${f.residents.filter((r) => r.state === "affected").map((r) => r.name).join("、") || "名指しできる人はいない"}`, alternative: "デマンド交通への乗り換えを案内" }),
];

const BANNED = /点数|採点|ランキング/;

type Row = { removal: string; sheet: number; ms: number; retries: number; unsourced: number; banned: boolean; namesAffected: boolean; len: number; gap: string };

async function runCase(removal: { name: string; trips: Trip[] }, sheetIdx: number): Promise<Row> {
  const facts = factsOf(removal.trips);
  const submission: Submission = {
    removed: removal.trips.map((x) => ({ trip_id: x.trip_id, family: x.family, departure: x.departure, headsign: x.headsign })),
    ...SHEETS[sheetIdx](facts, removal.trips),
  };
  const t0 = Date.now();
  const note: Note = await reviewSubmission(ticket, facts, submission);
  const affectedNames = facts.residents.filter((r) => r.state === "affected").map((r) => r.name);
  const text = `${note.good} ${note.gap} ${note.question}`;
  return {
    removal: removal.name,
    sheet: sheetIdx + 1,
    ms: Date.now() - t0,
    retries: note.retries,
    unsourced: unsourcedNumbers(note, facts, submission).length,
    banned: BANNED.test(text),
    namesAffected: affectedNames.length === 0 || affectedNames.some((n) => text.includes(n)),
    len: text.length,
    gap: note.gap,
  };
}

const model = process.env.ANTHROPIC_API_KEY ? (process.env.REVIEW_MODEL ?? "claude-opus-5-5") : "demo";
const rows: Row[] = [];
for (const removal of REMOVALS) for (let i = 0; i < SHEETS.length; i++) rows.push(await runCase(removal, i));

// 同じ1件を10回。抜けの文が同じ住民を名指しするか
const repeat: Row[] = [];
for (let i = 0; i < 10; i++) repeat.push(await runCase(REMOVALS[1], 0));
const affectedOf = (r: Row) => t.residents.map((x) => x.name).filter((n) => r.gap.includes(n)).sort().join("、") || "（名指しなし）";
const buckets = new Map<string, number>();
for (const r of repeat) buckets.set(affectedOf(r), (buckets.get(affectedOf(r)) ?? 0) + 1);

const pct = (n: number) => `${Math.round((n / rows.length) * 100)}%`;
const md = [
  `# 確認役の測定`,
  ``,
  `実行 ${new Date().toISOString().slice(0, 16).replace("T", " ")} ／ モデル ${model} ／ 20件 + 同一1件×10回`,
  model === "demo" ? `\n鍵が無いので demo の固定文で通した。LLM の測定はまだ。` : ``,
  ``,
  `| 指標 | 値 |`,
  `|---|---|`,
  `| 数字が出典に戻る（作り直し後） | ${pct(rows.filter((r) => r.unsourced === 0).length)} |`,
  `| 作り直し 0回 | ${pct(rows.filter((r) => r.retries === 0).length)} |`,
  `| 影響ありの住民を名指し | ${pct(rows.filter((r) => r.namesAffected).length)} |`,
  `| 点数・採点・ランキングを使わない | ${pct(rows.filter((r) => !r.banned).length)} |`,
  `| 付箋3枚の文字数 中央値 | ${[...rows].sort((a, b) => a.len - b.len)[Math.floor(rows.length / 2)].len} |`,
  `| 応答 中央値 ms | ${[...rows].sort((a, b) => a.ms - b.ms)[Math.floor(rows.length / 2)].ms} |`,
  ``,
  `## 同じ提出を10回（9時台を3便 × 用紙1）`,
  ``,
  ...[...buckets.entries()].map(([k, v]) => `- ${k}: ${v}回`),
  ``,
  `## 20件`,
  ``,
  `| 減らし方 | 用紙 | 作り直し | 出典なし | 名指し | 抜け |`,
  `|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.removal} | ${r.sheet} | ${r.retries} | ${r.unsourced} | ${r.namesAffected ? "○" : "×"} | ${r.gap.replaceAll("|", "｜")} |`),
  ``,
].join("\n");

mkdirSync("docs/eval", { recursive: true });
const out = `docs/eval/${model}.md`;
writeFileSync(out, md);
console.log(`書いた: ${out}`);
console.log(md.split("\n").slice(2, 14).join("\n"));
