import { expect, it } from "vitest";
import raw from "../../data/world.json";
import { worldStats, type World } from "./world";

const w = raw as unknown as World;

it("題の画面に出す数は、町・町丁・人口・根拠・出典のどれも 0 でない", () => {
  const s = worldStats(w);
  expect(s.towns).toBe(w.places.length);
  expect(s.blocks).toBe(w.marks.length);
  expect(s.people).toBeGreaterThan(10000);
  expect(s.facts).toBeGreaterThan(20);
  expect(s.sources).toBe(Object.keys(w.sources).length);
});
