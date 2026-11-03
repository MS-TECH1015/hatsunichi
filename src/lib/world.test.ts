import { describe, expect, it } from "vitest";
import world from "../../data/world.json";
import { clampToIsland, clockText, inMeters, nearestTarget, pushOut, roadTiles, type World } from "./world";

const w = inMeters(world as unknown as World);

describe("world", () => {
  it("道のタイルは重複しない", () => {
    const tiles = roadTiles([{ from: [0, 0], to: [2, 0] }, { from: [1, -1], to: [1, 1] }]);
    expect(tiles).toHaveLength(5);
  });

  it("物の円の中には入れない", () => {
    const [x, z] = pushOut([0.5, 0], [{ at: [0, 0], radius: 2 }]);
    expect(Math.hypot(x, z)).toBeCloseTo(2);
  });

  it("近くの住民を選ぶ。遠ければ null", () => {
    const hina = w.npcs.find((n) => n.id === "hina")!;
    expect(nearestTarget([hina.at[0] + 1, hina.at[1]], w)).toMatchObject({ type: "npc", npc: { id: "hina" } });
    expect(nearestTarget([100, 100], w)).toBeNull();
  });

  it("依頼のある場所には案が 3 つと窓口がある。数字は facts に出典がある", () => {
    for (const s of w.spots) {
      expect(s.quest.options).toHaveLength(3);
      expect(s.window.url).toMatch(/^https:\/\//);
      for (const f of s.facts) expect(w.sources[f.source]).toBeDefined();
      const digits = s.why.match(/\d+/g) ?? [];
      const known = s.facts.map((f) => f.text).join(" ");
      for (const d of digits) if (!/^[0-9]{1,2}$/.test(d) || Number(d) > 23) expect(known).toContain(d);
    }
  });

  it("画面に出す言葉は短い。調べた一言は 20 字まで、選択肢は 10 字まで", () => {
    for (const s of w.spots) {
      expect(s.hint.length).toBeLessThanOrEqual(20);
      for (const o of s.quest.options) expect(o.label.length).toBeLessThanOrEqual(10);
    }
  });

  it("島の外へは出られない。始まりの位置と依頼の場所は島の中", () => {
    const { min, max } = w.meta.island;
    expect(clampToIsland([min[0] - 50, max[1] + 50], w.meta.island)).toEqual([min[0] + 2, max[1] - 2]);
    for (const at of [w.meta.start, ...w.spots.map((s) => s.at)]) expect(clampToIsland(at, w.meta.island)).toEqual(at);
  });

  it("時計の表示", () => {
    expect(clockText(9 * 60 + 5)).toBe("9:05");
  });
});
