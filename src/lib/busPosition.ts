// 指定した時刻に、各便のバスがどこにいるかを停留所列の直線補間で出す。
import { toMinutes, type Stop, type Town, type Trip } from "./impact";

export type BusPose = { trip_id: string; lat: number; lon: number; bearing: number };

function bearingDeg(a: Stop, b: Stop): number {
  const dy = b.lat - a.lat;
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function busPose(town: Town, trip: Trip, minutes: number): BusPose | null {
  const byId = Object.fromEntries(town.stops.map((s) => [s.stop_id, s]));
  const times = trip.stop_times;
  if (minutes < toMinutes(times[0].time) || minutes > toMinutes(times[times.length - 1].time)) return null;
  for (let i = 0; i < times.length - 1; i++) {
    const t0 = toMinutes(times[i].time);
    const t1 = toMinutes(times[i + 1].time);
    if (minutes > t1) continue;
    const a = byId[times[i].stop_id];
    const b = byId[times[i + 1].stop_id];
    const f = t1 === t0 ? 0 : (minutes - t0) / (t1 - t0);
    return {
      trip_id: trip.trip_id,
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
      bearing: bearingDeg(a, b),
    };
  }
  return null;
}

export function busesAt(town: Town, removed: Set<string>, minutes: number): BusPose[] {
  const out: BusPose[] = [];
  for (const trip of town.trips) {
    if (removed.has(trip.trip_id)) continue;
    const pose = busPose(town, trip, minutes);
    if (pose) out.push(pose);
  }
  return out;
}
