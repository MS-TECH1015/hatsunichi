// 窓口に持っていく 1 枚。画面の書き写しと、確認役のサーバーが同じ文を作る。
// サーバーは画面から番号と値だけを受け取り、world.json から 1 枚を組み直す。自由に書けるのは自分で書いた案の一行だけ
import { CALCS } from "./calcs.ts";
import type { Facility, Fact, Spot, World } from "./world.ts";

export const PROPOSAL = { name: "鳥取市 公共施設マネジメント民間提案制度", url: "https://www.city.tottori.lg.jp/page/48913.html" };

export type SheetAnswer = { spot: Spot; option: string; own?: boolean; fact: Fact; calc?: string; place?: Facility };

/** 町の住民は架空なので、その声は載せない */
export function sheetOf(a: SheetAnswer, world: World): string {
  const src = world.sources[a.fact.source];
  const { submit } = world;
  const town = world.places.find((p) => p.id === a.place?.place)?.name ?? "";
  return [
    `■ ${a.spot.title}`,
    `案: ${a.option}`,
    `根拠: ${a.fact.text}`,
    `出典: ${src.name} ${src.url}`,
    a.calc && `計算（前提は推定）: ${a.calc}`,
    a.place && `使う場所: ${a.place.name}、${town}。鳥取市の未活用施設。今も使われていないかは未確認 出典: ${world.sources[a.place.sources[0]]?.name ?? ""}`,
    a.place && `参考: 市の施設の使い方は ${PROPOSAL.name} で民間から募っている。この施設の案を市が募っているわけではない ${PROPOSAL.url}`,
    `まだ確かめていないこと: ${a.spot.checks.join(" / ")}`,
    `出す先: ${submit.name} ${submit.url}`,
    a.spot.window.url !== submit.url && `担当の窓口: ${a.spot.window.name} ${a.spot.window.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 画面から確認役へ送るもの。option は選んだ案の番号、own は自分で書いた一行。どちらか一方 */
export type SheetRequest = { spot: string; option?: number; own?: string; fact: number; knobs?: Record<string, number>; facility?: string };

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
  return { spot, option: option?.text ?? own, own: !option, fact, calc, place };
}

/** 前提の値から計算の一文を作り直す。画面と同じ範囲の外の値は受け付けない */
function calcText(spotId: string, knobs: Record<string, number>): string | undefined {
  const calc = CALCS[spotId];
  if (!calc) return undefined;
  const inRange = calc.knobs.every((k) => Number.isFinite(knobs[k.id]) && knobs[k.id] >= k.min && knobs[k.id] <= k.max);
  if (!inRange) return undefined;
  return calc.say(Object.fromEntries(calc.knobs.map((k) => [k.id, knobs[k.id]])));
}
