import { describe, expect, it } from "vitest";
import { demoNote, unsourcedNumbers, type Facts, type Submission } from "./review";

const facts: Facts = {
  persons: { low: 372, mid: 558, high: 744 },
  dots: 93,
  load_factor: 0.3,
  residents: [{ name: "岡本 清", role: "通院", hour_band: "09", state: "affected" }],
  weekday_trips: 63,
};
const submission: Submission = {
  removed: [{ trip_id: "t", family: "雲山市立病院線", departure: "09:25", headsign: "鳥取駅" }],
  reason: "9時台は本数が多い",
  affected: "約370人",
  alternative: "10時台に寄せる",
};

describe("unsourcedNumbers", () => {
  it("facts と用紙にある数字は通る", () => {
    expect(unsourcedNumbers({ good: "09:25 の便で 372人", gap: "93点", question: "0.3" }, facts, submission)).toEqual([]);
  });
  it("無い数字を名指しする", () => {
    expect(unsourcedNumbers({ good: "1200人に影響", gap: "", question: "" }, facts, submission)).toEqual(["1200"]);
  });
});

describe("demoNote", () => {
  it("鍵が無くても計算結果だけから付箋を作る", () => {
    const n = demoNote(facts, submission);
    expect(n.demo).toBe(true);
    expect(n.gap).toContain("岡本 清");
    expect(unsourcedNumbers(n, facts, submission)).toEqual([]);
  });
});
