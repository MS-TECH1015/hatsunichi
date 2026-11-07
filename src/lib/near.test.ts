import { describe, expect, it } from "vitest";
import world from "../../data/world.json";
import data from "../../public/city/near.json";
import { nearLine, nearMe, type NearData } from "./near";
import { placeWorld, type World } from "./world";

const w = placeWorld(world as unknown as World);
const d = data as unknown as NearData;

describe("自分の家の近く", () => {
  it("鳥取駅の近くの町を選ぶと、近い順に空き家と停留所が出て、町は駅", () => {
    const me = nearMe("栄町", d, w)!;
    expect(me.place.id).toBe("eki");
    expect(me.akiya.length).toBeGreaterThan(0);
    expect(me.akiya.every((a, i) => i === 0 || me.akiya[i - 1].m <= a.m)).toBe(true);
    expect(me.akiya.every((a) => a.status !== "closed")).toBe(true);
    expect(me.stop!.m).toBeLessThan(1000);
  });

  it("一覧に無い町名は何も出さない", () => {
    expect(nearMe("どこでもない町", d, w)).toBeNull();
  });

  it("1 枚の行は町名と距離だけで、座標を書かない", () => {
    const me = nearMe("栄町", d, w)!;
    expect(nearLine(me, [me.at[0] + 20, me.at[1]])).toBe("提案者は栄町に住んでいて、ここまでまっすぐ測って 1.0 km");
  });
});
