// 便を外したときに影響を受ける点を決める規則。LLM は使わない。
// 規則: 外した便の各停留所について、停留所圏内の点のうち、時間帯が発時刻と同じで、
// 残っている便が ±30分に無い点を「影響あり」とする。人数 = 点数 × 1点の人数 × 乗車率。

export type Stop = { stop_id: string; name: string; lat: number; lon: number; source_id: string };
export type StopTime = { stop_id: string; time: string };
export type Trip = {
  trip_id: string;
  route_id: string;
  family: string;
  headsign: string;
  departure: string;
  stop_times: StopTime[];
  source_id: string;
};
export type Dot = {
  dot_id: string;
  district_id: string;
  lat: number;
  lon: number;
  persons: number;
  purpose: string;
  hour_band: string;
  source_id: string;
};
export type Resident = {
  id: string;
  name: string;
  age: number;
  role: string;
  district_id: string;
  lat: number;
  lon: number;
  purpose: string;
  hour_band: string;
  lines: { default: string; affected: string; relieved: string };
};
export type Town = {
  stops: Stop[];
  trips: Trip[];
  dots: Dot[];
  residents: Resident[];
  assumptions: {
    load_factor_default: number;
    load_factor_range: number;
    alternative_window_min: number;
    stop_radius_m: number;
    persons_per_dot: number;
  };
};

export type Impact = {
  dots: Dot[];
  persons: { low: number; mid: number; high: number };
};

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// 停留所ごとの圏内の点。町は変わらないので町ごとに1回だけ計算する
const catchmentCache = new WeakMap<Town, Map<string, Dot[]>>();
function dotsNearStop(town: Town, stopId: string): Dot[] {
  let byStop = catchmentCache.get(town);
  if (!byStop) {
    byStop = new Map();
    for (const s of town.stops) {
      byStop.set(
        s.stop_id,
        town.dots.filter((d) => distanceM(d.lat, d.lon, s.lat, s.lon) <= town.assumptions.stop_radius_m),
      );
    }
    catchmentCache.set(town, byStop);
  }
  return byStop.get(stopId) ?? [];
}

// 残っている便が、その停留所を ±window 分以内に通るか
export function hasAlternative(town: Town, removed: Set<string>, stopId: string, time: string): boolean {
  const target = toMinutes(time);
  const window = town.assumptions.alternative_window_min;
  for (const t of town.trips) {
    if (removed.has(t.trip_id)) continue;
    const st = t.stop_times.find((x) => x.stop_id === stopId);
    if (!st) continue;
    if (Math.abs(toMinutes(st.time) - target) <= window) return true;
  }
  return false;
}

function affectedDotsOfTrip(town: Town, removed: Set<string>, trip: Trip, out: Map<string, Dot>) {
  for (const st of trip.stop_times) {
    if (hasAlternative(town, removed, st.stop_id, st.time)) continue;
    const hour = st.time.slice(0, 2);
    for (const d of dotsNearStop(town, st.stop_id)) {
      if (d.hour_band !== hour) continue;
      out.set(d.dot_id, d);
    }
  }
}

export function impactOf(town: Town, removedTripIds: Iterable<string>, loadFactor?: number): Impact {
  const removed = new Set(removedTripIds);
  const out = new Map<string, Dot>();
  for (const trip of town.trips) {
    if (!removed.has(trip.trip_id)) continue;
    affectedDotsOfTrip(town, removed, trip, out);
  }
  const dots = [...out.values()];
  const load = loadFactor ?? town.assumptions.load_factor_default;
  const range = town.assumptions.load_factor_range;
  const persons = dots.reduce((a, d) => a + d.persons, 0);
  return {
    dots,
    persons: {
      low: Math.round(persons * Math.max(0, load - range)),
      mid: Math.round(persons * load),
      high: Math.round(persons * Math.min(1, load + range)),
    },
  };
}

// 1便ぶんの想定利用者の幅。便一覧の列に使う。他の便はすべて残っている前提
export function ridersOfTrip(town: Town, trip: Trip, loadFactor?: number): Impact["persons"] {
  return impactOf(town, [trip.trip_id], loadFactor).persons;
}

export type ResidentState = "default" | "affected" | "relieved";

// 住民も点と同じ規則を通す。外した便が1つも無ければ default
export function residentState(town: Town, removedTripIds: Iterable<string>, resident: Resident): ResidentState {
  const removed = new Set(removedTripIds);
  if (removed.size === 0) return "default";
  for (const trip of town.trips) {
    if (!removed.has(trip.trip_id)) continue;
    for (const st of trip.stop_times) {
      if (st.time.slice(0, 2) !== resident.hour_band) continue;
      const stop = town.stops.find((s) => s.stop_id === st.stop_id);
      if (!stop) continue;
      if (distanceM(resident.lat, resident.lon, stop.lat, stop.lon) > town.assumptions.stop_radius_m) continue;
      if (hasAlternative(town, removed, st.stop_id, st.time)) continue;
      return "affected";
    }
  }
  return "relieved";
}
