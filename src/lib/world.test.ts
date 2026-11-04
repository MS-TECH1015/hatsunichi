import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import world from "../../data/world.json";
import city from "../../public/city/city.json";
import { busMinutes, clockText, heightAt, nearestTarget, placeWorld, pushOut, routeBetween, stepWithin, unsourcedNumbers, walkable, type Ground, type Route, type World } from "./world";

const w = placeWorld(world as unknown as World);
const bytes = (path: string) => readFileSync(new URL(path, import.meta.url));
const heightBytes = bytes("../../public/city/height.bin");
const ground: Ground = {
  ...city.grid,
  x0: city.grid.x0,
  z0: city.grid.z0,
  height: new Int16Array(heightBytes.buffer, heightBytes.byteOffset, heightBytes.byteLength / 2),
  mask: new Uint8Array(bytes("../../public/city/mask.bin")),
};

describe("world", () => {
  it("場所の中の座標は、場所の位置を足して市全体の座標になる", () => {
    const eki = w.places.find((p) => p.id === "eki")!;
    const shop = w.spots.find((s) => s.id === "shop1")!;
    const local = (world as unknown as World).spots.find((s) => s.id === "shop1")!.at;
    expect(shop.at).toEqual([eki.at[0] + local[0], eki.at[1] + local[1]]);
    expect(w.stops.length).toBe(w.places.filter((p) => p.hub).length);
  });

  it("物の円の中には入れない", () => {
    const [x, z] = pushOut([0.5, 0], [{ at: [0, 0], radius: 2 }]);
    expect(Math.hypot(x, z)).toBeCloseTo(2);
  });

  it("近くの住民を選ぶ。バスの標識も話せる相手になる。遠ければ null", () => {
    const hina = w.npcs.find((n) => n.id === "hina")!;
    expect(nearestTarget([hina.at[0] + 1, hina.at[1]], w)).toMatchObject({ type: "npc", npc: { id: "hina" } });
    const stop = w.stops[0];
    expect(nearestTarget([stop.at[0], stop.at[1] + 1], w)).toMatchObject({ type: "bus", place: { id: stop.place.id } });
    expect(nearestTarget([1000, 1000], w)).toBeNull();
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

  it("依頼ごとに、立場の違う住民が 2 人以上いて、自分の一行を書く問いと確かめる問いがある", () => {
    for (const s of w.spots) {
      const voices = w.npcs.filter((n) => n.place === s.place && n.view);
      expect(voices.length, s.id).toBeGreaterThanOrEqual(2);
      expect(s.quest.write.length, s.id).toBeGreaterThan(0);
      expect(s.checks.length, s.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("案を出す先は、提案を受け付けると書いた公式ページで、出典がある", () => {
    expect(w.submit.url).toMatch(/^https:\/\//);
    expect(w.sources[w.submit.source]).toBeDefined();
  });

  it("案は根拠の数字を選んで出す。どの依頼にも数字が 1 つ以上ある", () => {
    for (const s of w.spots) expect(s.facts.length, s.id).toBeGreaterThan(0);
  });

  it("自分の一行の数字照合。調べた数字に無いものだけ拾い、1 桁と時刻は拾わない", () => {
    const facts = [{ text: "平日の便 63 本。空き家は 4,207 件。高齢化率 42.9%", source: "x" }];
    expect(unsourcedNumbers("７時台と17時の便を残し、週3日、63本のうち10本を減らす", facts)).toEqual(["10"]);
    expect(unsourcedNumbers("4207件の空き家と、42.9%の高齢化", facts)).toEqual([]);
    expect(unsourcedNumbers("4,207件のうち500件", facts)).toEqual(["500"]);
  });

  it("住民のせりふと立場の数字は、同じ町の依頼の facts にある", () => {
    for (const n of w.npcs) {
      const known = w.spots
        .filter((s) => s.place === n.place)
        .flatMap((s) => s.facts.map((f) => f.text))
        .join(" ");
      const digits = [...n.lines, n.view ?? ""].join(" ").match(/\d+(\.\d+)?/g) ?? [];
      for (const d of digits) if (!/^[0-9]$/.test(d)) expect(known, `${n.id}: ${d}`).toContain(d);
    }
  });

  it("画面に出す言葉は短い。調べた一言は 20 字まで、選択肢は 10 字まで", () => {
    for (const s of w.spots) {
      expect(s.hint.length).toBeLessThanOrEqual(20);
      for (const o of s.quest.options) expect(o.label.length).toBeLessThanOrEqual(10);
    }
    for (const n of w.npcs) if (n.view) expect(n.view.length, n.id).toBeLessThanOrEqual(12);
  });

  it("せりふと説明は短く。文字が多いと読まれない", () => {
    for (const n of w.npcs) {
      expect(n.lines.length, n.id).toBeLessThanOrEqual(n.kind === "rabbit" ? 4 : 2);
      for (const l of n.lines) expect(l.length, `${n.id}: ${l}`).toBeLessThanOrEqual(22);
    }
    for (const s of w.spots) {
      const short = [s.quest.ask, s.quest.write, ...s.checks, ...s.quest.options.flatMap((o) => [o.note.good, o.note.gap, o.note.question])];
      for (const t of short) expect(t.length, `${s.id}: ${t}`).toBeLessThanOrEqual(18);
      expect(s.checks.length, s.id).toBeLessThanOrEqual(2);
      expect(s.why.length, s.id).toBeLessThanOrEqual(80);
    }
  });

  it("始まりの位置・依頼の場所・住民・バスの標識は、市の中の歩ける所にある", () => {
    for (const at of [w.start, ...w.spots.map((s) => s.at), ...w.npcs.map((n) => n.at), ...w.stops.map((s) => s.at)]) {
      expect(walkable(ground, at[0], at[1])).toBe(true);
    }
  });

  it("海と市の外へは歩けない。壁に沿って滑る", () => {
    expect(walkable(ground, 0, -200)).toBe(false); // 鳥取駅から 10 km 北は日本海
    expect(walkable(ground, 5000, 0)).toBe(false);
    expect(stepWithin(ground, w.start, [w.start[0], -200])).toEqual(w.start);
    expect(stepWithin(ground, w.start, [w.start[0] + 1, -200])).toEqual([w.start[0] + 1, w.start[1]]);
  });

  it("足もとの高さは格子の点のあいだを線形に補う", () => {
    const g: Ground = { x0: 0, z0: 0, cell: 2, w: 2, h: 2, height: new Int16Array([0, 200, 0, 200]), mask: new Uint8Array(4) };
    expect(heightAt(g, 1, 1)).toBeCloseTo(1);
    expect(heightAt(ground, w.start[0], w.start[1])).toBeGreaterThan(0);
  });

  it("バスの経路は、どの場所どうしにもあり、逆向きは道を裏返す", () => {
    const routes = city.routes as unknown as Record<string, Route>;
    const hubs = w.places.filter((p) => p.hub).map((p) => p.id);
    for (const a of hubs) for (const b of hubs) if (a !== b) expect(routeBetween(routes, a, b)).not.toBeNull();
    const go = routeBetween(routes, "eki", "mochigase")!;
    const back = routeBetween(routes, "mochigase", "eki")!;
    expect(back.path[0]).toEqual(go.path[go.path.length - 1]);
    expect(busMinutes(25)).toBe(60);
  });

  it("時計の表示", () => {
    expect(clockText(9 * 60 + 5)).toBe("9:05");
  });
});
