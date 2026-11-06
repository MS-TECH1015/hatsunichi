import { expect, it } from "vitest";
import raw from "../../data/world.json";
import { answerFromRequest, sheetOf, type SheetAnswer } from "./sheet";
import { placeStats, worldStats, type World } from "./world";

const w = raw as unknown as World;

it("題の画面に出す数は、町・町丁・人口・根拠・出典のどれも 0 でない", () => {
  const s = worldStats(w);
  expect(s.towns).toBe(w.places.length);
  expect(s.blocks).toBe(w.marks.length);
  expect(s.people).toBeGreaterThan(10000);
  expect(s.facts).toBeGreaterThan(20);
  expect(s.sources).toBe(Object.keys(w.sources).length);
});

it("町の町丁の人口は札の合計で、出典は札のもの。1 枚の「関わる人」の行になる", () => {
  const s = placeStats(w, "mochigase");
  expect(s.blocks).toBeGreaterThan(0);
  expect(s.people).toBeGreaterThan(0);
  expect(s.oldShare).toBeGreaterThan(0);
  for (const id of s.sources) expect(w.sources[id], id).toBeDefined();
  const total = w.places.reduce((n, p) => n + placeStats(w, p.id).people, 0);
  expect(total).toBe(worldStats(w).people);

  const a = answerFromRequest(w, { spot: "empty1", option: 0, fact: 0 }) as SheetAnswer;
  expect(sheetOf(a, w)).toContain(`関わる人: 用瀬の ${s.blocks} の町丁に住む ${s.people.toLocaleString()} 人。65 歳以上が ${s.oldShare}%`);
});
