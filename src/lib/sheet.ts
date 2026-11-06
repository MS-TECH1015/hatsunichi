// 窓口に持っていく 1 枚。画面の書き写しと、確認役のサーバーが同じ文を作る。
// サーバーは画面から番号と値だけを受け取り、world.json から 1 枚を組み直す。自由に書けるのは自分で書いた案の一行だけ
import { CALCS } from "./calcs.ts";
import { changeText, placeStats, worldStats } from "./world.ts";
import type { Facility, Fact, Spot, World } from "./world.ts";

export const PROPOSAL = { name: "鳥取市 公共施設マネジメント民間提案制度", url: "https://www.city.tottori.lg.jp/page/48913.html" };

export type SheetAnswer = { spot: Spot; option: string; own?: boolean; concern?: string; fact: Fact; calc?: string; why?: string; self?: string; place?: Facility; review?: SheetReview };

/** 確認役（Claude）が 1 枚に付けた問い。記録なら date が入る。受け手に、学生がどこまで確かめたかを見せる */
export type SheetReview = { question: string; model: string; date?: string };

/** 1 枚の使い道。市に出すか、事業の構想として持ち帰るか */
export type SheetUse = "city" | "business";

/** 町の住民は架空なので、その声は載せない */
export function sheetOf(a: SheetAnswer, world: World, use: SheetUse = "city"): string {
  const src = world.sources[a.fact.source];
  const town = world.places.find((p) => p.id === a.place?.place)?.name ?? "";
  return [
    use === "business" ? `■ ${a.spot.title}（事業の構想として）` : `■ ${a.spot.title}`,
    a.concern && `きっかけ（自分の困りごと）: ${a.concern}`,
    `案: ${a.option}`,
    `根拠: ${a.fact.text}`,
    `出典: ${src.name} ${src.url}`,
    a.calc && `計算: ${a.calc}`,
    a.calc && calcBasis(a, world),
    a.calc && CALCS[a.spot.id] && `計算の前提（推定）: ${CALCS[a.spot.id].knobs.map((k) => k.label).join("、")}`,
    a.calc && a.why && `前提の置き方: ${a.why}`,
    placeLine(a, world),
    a.self && `自分は: ${a.self}`,
    a.place && `使う場所: ${a.place.name}、${town}。鳥取市の未活用施設。今も使われていないかは未確認 出典: ${world.sources[a.place.sources[0]]?.name ?? ""}`,
    a.place && `参考: 市の施設の使い方は ${PROPOSAL.name} で民間から募っている。この施設の案を市が募っているわけではない ${PROPOSAL.url}`,
    `まだ確かめていないこと: ${a.spot.checks.join(" / ")}`,
    a.review && `確認役の問い: ${a.review.question}（${a.review.model}${a.review.date ? `、${a.review.date} の記録` : ""}）`,
    ...(use === "business" ? businessLines(a, world) : cityLines(a, world)),
  ]
    .filter(Boolean)
    .join("\n");
}

function cityLines(a: SheetAnswer, { submit }: World) {
  return [`出す先: ${submit.name} ${submit.url}`, a.spot.window.url !== submit.url && `担当の窓口: ${a.spot.window.name} ${a.spot.window.url}`, doingLine(a), heardLine(a)];
}

/** 持ち帰る人には、この困りごとの担当課と、市の事業者向け制度の一覧だけを渡す。合う制度を名指しはしない */
function businessLines(a: SheetAnswer, { business }: World) {
  return [`この困りごとの担当: ${a.spot.window.name} ${a.spot.window.url}`, doingLine(a), heardLine(a), `事業の相談先: ${business.name} ${business.url}`, `相談先について: ${business.note}`];
}

function heardLine({ spot: { heard } }: SheetAnswer) {
  if (!heard) return false;
  return `市政提案に出た近い提案: ${heard.gap ? `${heard.gap}その 1 件は ` : ""}「${heard.title}」${heard.received} 受付、${heard.updated} にページ更新。市の回答の要旨: ${heard.answer} ${heard.url}`;
}

function doingLine(a: SheetAnswer) {
  return `窓口がすでにしていること（${a.spot.window.checked} にページで確認）: ${a.spot.window.doing}`;
}

/** 画面から確認役へ送るもの。option は選んだ案の番号、own は自分で書いた一行。どちらか一方 */
export type SheetRequest = { spot: string; option?: number; own?: string; fact: number; knobs?: Record<string, number>; why?: string; self?: number; facility?: string };

/** 計算の前提をそう置いた理由の一言の上限 */
export const WHY_MAX = 40;

/** 自分で書いた一行の上限。窓口に一文で伝わる長さで、画面の入力欄も同じ */
export const OWN_MAX = 60;

/** 送られてきた番号と値から 1 枚の中身を組み直す。おかしければ理由の文を返す */
export function answerFromRequest(world: World, req: SheetRequest): SheetAnswer | string {
  const spot = world.spots.find((s) => s.id === req.spot);
  if (!spot) return "依頼の場所が無い";
  const fact = typeof req.fact === "number" ? spot.facts[req.fact] : undefined;
  if (!fact) return "根拠の番号が無い";
  const option = typeof req.option === "number" ? spot.quest.options[req.option] : undefined;
  const own = typeof req.own === "string" ? req.own.trim() : "";
  if (!option && !own) return "案が無い";
  if (own.length > OWN_MAX) return `自分で書いた案は ${OWN_MAX} 字まで`;
  const place = req.facility ? world.facilities.find((f) => f.id === req.facility) : undefined;
  if (req.facility && !place) return "施設が無い";
  const calc = req.knobs ? calcText(spot.id, req.knobs) : undefined;
  if (req.knobs && !calc) return "計算の前提が範囲の外";
  const why = calc && typeof req.why === "string" ? req.why.trim() : "";
  if (why.length > WHY_MAX) return `前提の置き方は ${WHY_MAX} 字まで`;
  const self = typeof req.self === "number" ? spot.self?.options[req.self] : undefined;
  if (typeof req.self === "number" && !self) return "自分の答えの番号が無い";
  return { spot, option: option?.text ?? own, own: !option, fact, calc, why: why || undefined, self, place };
}

/** 案が関わる人の規模。その町の町丁の札を合計した数で、町丁の札が無い町には書かない */
function placeLine(a: SheetAnswer, world: World): string | undefined {
  const s = placeStats(world, a.spot.place);
  if (s.people === 0) return undefined;
  const town = world.places.find((p) => p.id === a.spot.place)?.name ?? "";
  const src = s.sources.map((id) => world.sources[id]?.name ?? id).join(" / ");
  const all = worldStats(world);
  return `関わる人: ${town}の ${s.blocks} 町丁に住む ${s.people.toLocaleString()} 人。65 歳以上が ${s.oldShare}%、${all.towns} つの町の ${all.blocks} 町丁の合計では ${all.oldShare}%。${changeText(s.change)} 出典: ${src}`;
}

/** 計算が使う出典の数字のうち、根拠の行に無いもの。出典の数字と、本人が動かした前提を読み手が分けられるようにする */
function calcBasis(a: SheetAnswer, world: World): string | undefined {
  const facts = [...new Set((CALCS[a.spot.id]?.bases ?? []).map((b) => a.spot.facts[b.fact]))].filter((f) => f && f.text !== a.fact.text);
  if (facts.length === 0) return undefined;
  return `計算の根拠: ${facts.map((f) => `${f.text} 出典: ${world.sources[f.source]?.name ?? ""}`).join(" / ")}`;
}

/** 前提の値から計算の一文を作り直す。画面と同じ範囲の外の値は受け付けない */
function calcText(spotId: string, knobs: Record<string, number>): string | undefined {
  const calc = CALCS[spotId];
  if (!calc) return undefined;
  const inRange = calc.knobs.every((k) => Number.isFinite(knobs[k.id]) && knobs[k.id] >= k.min && knobs[k.id] <= k.max);
  if (!inRange) return undefined;
  return calc.say(Object.fromEntries(calc.knobs.map((k) => [k.id, knobs[k.id]])));
}
