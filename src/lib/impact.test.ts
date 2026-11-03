import { describe, expect, it } from "vitest";
import { impactOf, residentState, ridersOfTrip, type Town } from "./impact";

// 停留所 A（0,0 付近）と B（約2km 東）。A を 09:00 と 09:20 に通る便と、B だけを通る便
const A = { stop_id: "A", name: "A", lat: 35.5, lon: 134.2, source_id: "t" };
const B = { stop_id: "B", name: "B", lat: 35.5, lon: 134.222, source_id: "t" };
const trip = (id: string, times: [string, string][]) => ({
  trip_id: id,
  route_id: "R",
  family: "F",
  headsign: "H",
  departure: times[0][1],
  stop_times: times.map(([stop_id, time]) => ({ stop_id, time })),
  source_id: "t",
});
const dot = (id: string, lat: number, lon: number, hour_band: string) => ({
  dot_id: id,
  district_id: "D",
  lat,
  lon,
  persons: 20,
  purpose: "通院",
  hour_band,
  source_id: "t",
});

const town: Town = {
  stops: [A, B],
  trips: [trip("t900", [["A", "09:00"], ["B", "09:10"]]), trip("t920", [["A", "09:20"], ["B", "09:30"]]), trip("t1200", [["A", "12:00"]])],
  dots: [
    dot("near09", 35.501, 134.2, "09"), // A から約110m、9時台
    dot("near12", 35.501, 134.201, "12"), // A の近くだが12時台
    dot("far09", 35.52, 134.2, "09"), // A から約2.2km
    dot("nearB09", 35.5, 134.223, "09"), // B の近く、9時台
  ],
  residents: [
    { id: "r", name: "x", age: 30, role: "y", district_id: "D", lat: 35.501, lon: 134.2, purpose: "通院", hour_band: "09", lines: { default: "", affected: "", relieved: "" } },
  ],
  assumptions: { load_factor_default: 0.3, load_factor_range: 0.1, alternative_window_min: 30, stop_radius_m: 400, persons_per_dot: 20 },
};

describe("impactOf", () => {
  it("何も外さなければ影響は無い", () => {
    expect(impactOf(town, []).dots).toHaveLength(0);
  });
  it("±30分に残る便があれば影響は無い", () => {
    expect(impactOf(town, ["t900"]).dots).toHaveLength(0);
  });
  it("9時台の便を両方外すと、圏内で9時台の点だけが灯る", () => {
    const ids = impactOf(town, ["t900", "t920"]).dots.map((d) => d.dot_id).sort();
    expect(ids).toEqual(["near09", "nearB09"]);
  });
  it("人数は 点数 × 20 × 乗車率 で、±0.1 の幅", () => {
    expect(impactOf(town, ["t900", "t920"]).persons).toEqual({ low: 8, mid: 12, high: 16 });
    expect(impactOf(town, ["t900", "t920"], 0.5).persons).toEqual({ low: 16, mid: 20, high: 24 });
  });
  it("12時台は代替便が無いので1便でも灯る", () => {
    expect(impactOf(town, ["t1200"]).dots.map((d) => d.dot_id)).toEqual(["near12"]);
  });
  it("ridersOfTrip は他の便が残っている前提の1便ぶん", () => {
    expect(ridersOfTrip(town, town.trips[0]).mid).toBe(0);
    expect(ridersOfTrip(town, town.trips[2]).mid).toBe(6);
  });
});

describe("residentState", () => {
  const r = town.residents[0];
  it("外した便が無ければ default", () => expect(residentState(town, [], r)).toBe("default"));
  it("代替があれば relieved", () => expect(residentState(town, ["t900"], r)).toBe("relieved"));
  it("9時台が両方消えると affected", () => expect(residentState(town, ["t900", "t920"], r)).toBe("affected"));
});
