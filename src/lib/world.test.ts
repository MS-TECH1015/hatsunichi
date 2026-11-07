import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import world from "../../data/world.json";
import city from "../../public/city/city.json";
import { CALCS, defaults } from "./calcs";
import { PAST_ICONS, busMinutes, cityAt, pocketAt, pocketOrigin, clockText, facilityFind, heightAt, markFind, nearestMark, nearestTarget, placeWorld, pushOut, rideFind, routeBetween, spotFind, stepWithin, straightKm, unsourcedNumbers, walkable, type Ground, type Route, type World } from "./world";

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
  it("場所の中の座標は、場所の位置を足して市全体の座標になる。実在の町は離れた所の原点を足す", () => {
    const fukube = w.places.find((p) => p.id === "fukube")!;
    const field = w.spots.find((s) => s.place === "fukube")!;
    const local = (world as unknown as World).spots.find((s) => s.id === field.id)!.at;
    expect(field.at).toEqual([fukube.at[0] + local[0], fukube.at[1] + local[1]]);
    const shop = w.spots.find((s) => s.id === "shop1")!;
    const shopLocal = (world as unknown as World).spots.find((s) => s.id === "shop1")!.at;
    const o = pocketOrigin("eki")!;
    expect(shop.at).toEqual([o[0] + shopLocal[0], o[1] + shopLocal[1]]);
    expect(pocketAt(shop.at)).toBe("eki");
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
      expect(s.window.doing.length).toBeGreaterThan(10);
      expect(s.window.checked).toMatch(/^2026-\d\d-\d\d$/);
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

  it("手帳の距離は緯度経度の直線距離で、行きと帰りで同じ 1 行になる", () => {
    const eki = w.places.find((p) => p.id === "eki")!;
    const sakyu = w.places.find((p) => p.id === "sakyu")!;
    const km = straightKm(eki.geo, sakyu.geo);
    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(8);
    expect(rideFind(eki, sakyu).id).toBe(rideFind(sakyu, eki).id);
  });

  it("依頼の場所で手帳に残す 1 行は、どの依頼でも出典の名前が引ける", () => {
    for (const s of w.spots) expect(spotFind(s, w.sources).source, s.id).toBe(w.sources[s.facts[0].source].name);
  });

  it("書き写す1枚に載る、まだ確かめていないことに、架空の住民の名前を入れない", () => {
    for (const s of w.spots) for (const c of s.checks) for (const n of w.npcs) expect(c, s.id).not.toContain(n.name);
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
      // 頼んだ人が本人に聞く一問。答えは 1 枚に載るので、それだけで意味が通る文にする
      expect(s.self?.ask.length ?? 0, s.id).toBeLessThanOrEqual(18);
      expect(s.self?.options.length, s.id).toBe(3);
      for (const o of s.self?.options ?? []) expect(o.length, `${s.id}: ${o}`).toBeLessThanOrEqual(12);
    }
  });

  it("町のむかしは出典のある短い一文。地元を探す画面に並べる", () => {
    const withPast = w.places.filter((p) => p.past?.length);
    expect(withPast.length).toBeGreaterThan(0);
    for (const p of withPast)
      for (const f of p.past ?? []) {
        expect(w.sources[f.source]?.url, `${p.id}: ${f.source}`).toMatch(/^https:\/\//);
        expect(f.text.length, `${p.id}: ${f.text}`).toBeLessThanOrEqual(50);
        expect(PAST_ICONS, `${p.id}: ${f.text}`).toContain(f.icon);
      }
  });

  it("始まりの位置・依頼の場所・住民・バスの標識は、市の中の歩ける所にある", () => {
    for (const at of [w.start, ...w.spots.map((s) => s.at), ...w.npcs.map((n) => n.at), ...w.stops.map((s) => s.at)]) {
      const [x, z] = cityAt(w.places, at); // 実在の町の中は、市の地図の上の同じ所で確かめる
      expect(walkable(ground, x, z)).toBe(true);
    }
  });

  it("海と市の外へは歩けない。壁に沿って滑る", () => {
    expect(walkable(ground, 0, -200)).toBe(false); // 鳥取駅から 10 km 北は日本海
    expect(walkable(ground, 5000, 0)).toBe(false);
    const start = cityAt(w.places, w.start);
    expect(stepWithin(ground, start, [start[0], -200])).toEqual(start);
    expect(stepWithin(ground, start, [start[0] + 1, -200])).toEqual([start[0] + 1, start[1]]);
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

describe("町丁の印", () => {
  it("どの印も場所と出典があり、id が重ならず、歩ける所にある", () => {
    expect(w.marks.length).toBeGreaterThan(0);
    expect(new Set(w.marks.map((m) => m.id)).size).toBe(w.marks.length);
    for (const m of w.marks) {
      expect(w.places.some((p) => p.id === m.place)).toBe(true);
      for (const k of m.sources) expect(w.sources[k]).toBeDefined();
      expect(walkable(ground, ...cityAt(w.places, m.at))).toBe(true);
    }
  });

  it("近くに来た印だけ拾い、手帳では印の id と場所を持つ", () => {
    const m = w.marks[0];
    expect(nearestMark(m.at, w.marks)?.id).toBe(m.id);
    expect(nearestMark([m.at[0] + 50, m.at[1] + 50], [m])).toBeNull();
    const f = markFind(m, w.sources);
    expect(f.id).toBe(`mark:${m.id}`);
    expect(f.place).toBe(m.place);
    expect(f.source).toContain("国勢調査");
  });
});

describe("町ごとの計算", () => {
  const nums = (t: string) => t.normalize("NFKC").replace(/(\d),(\d)/g, "$1$2").match(/\d+(\.\d+)?/g) ?? [];

  it("9 つの依頼の場所すべてにあり、根拠の数字はその場所の文に書いてある", () => {
    expect(Object.keys(CALCS).sort()).toEqual(w.spots.map((s) => s.id).sort());
    for (const [id, calc] of Object.entries(CALCS)) {
      const spot = w.spots.find((s) => s.id === id)!;
      for (const b of calc.bases) expect(nums(spot.facts[b.fact].text)).toContain(String(b.value));
    }
  });

  it("前提を端まで動かしても、結果の文に NaN や Infinity が出ない", () => {
    for (const calc of Object.values(CALCS)) {
      for (const k of calc.knobs) expect(k.value >= k.min && k.value <= k.max).toBe(true);
      const low = Object.fromEntries(calc.knobs.map((k) => [k.id, k.min]));
      const high = Object.fromEntries(calc.knobs.map((k) => [k.id, k.max]));
      for (const v of [defaults(calc), low, high]) expect(calc.say(v)).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe("未活用施設", () => {
  it("どの札も場所と出典があり、id が重ならず、歩ける所にある", () => {
    expect(w.facilities.length).toBeGreaterThan(0);
    expect(new Set(w.facilities.map((f) => f.id)).size).toBe(w.facilities.length);
    for (const f of w.facilities) {
      expect(w.places.some((p) => p.id === f.place)).toBe(true);
      for (const k of f.sources) expect(w.sources[k]).toBeDefined();
      expect(walkable(ground, ...cityAt(w.places, f.at))).toBe(true);
    }
  });

  it("文は一覧の時点のものだと分かるように「未確認」で終わり、手帳では fac: の id を持つ", () => {
    for (const f of w.facilities) expect(f.text.endsWith("今も使われていないかは未確認")).toBe(true);
    const f = facilityFind(w.facilities[0], w.sources);
    expect(f.id).toBe(`fac:${w.facilities[0].id}`);
    expect(f.source).toContain("未活用施設");
  });
});

it("解く課題の数字と出す先の件数には出典があり、文に数字が入っている", () => {
  expect(w.problem.length).toBeGreaterThan(0);
  for (const p of w.problem) {
    expect(w.sources[p.source], p.source).toBeDefined();
    expect(p.text).toMatch(/\d/);
  }
  expect(w.sources[w.submit.listed.source]).toBeDefined();
});
