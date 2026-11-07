import { describe, expect, it } from "vitest";
import { findUnsourcedNumbers } from "./check-sources.mjs";

describe("findUnsourcedNumbers", () => {
  it("出典の無い数値を拾う", () => {
    expect(findUnsourcedNumbers({ n: 5 })).toEqual([".n = 5"]);
  });

  it("出典を持つ要素の中の数値は通す", () => {
    const json = { meta: { sources: [{ source_id: "a" }] }, x: { source_id: "a", n: 5, y: { m: 1 } } };
    expect(findUnsourcedNumbers(json)).toEqual([]);
  });

  it("meta.sources に無い source_id を拾う", () => {
    expect(findUnsourcedNumbers({ x: { source_id: "b", n: 1 } })).toEqual(['.x: source_id "b" は meta.sources に無い']);
  });
});
