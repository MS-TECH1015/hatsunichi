// data/raw/ の公式ファイルから data/town.json を作る。LLM は使わない。
// 入力: 日本交通 GTFS-JP、鳥取市 町別・5歳階級別人口、国交省 位置参照情報。
// 出力の数値はすべて meta.sources の source_id に戻れる。仮定の値は assumptions にだけ置く。
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import xlsx from "xlsx";

const RAW = "data/raw";
const ROUTE_FAMILIES = ["雲山市立病院線", "津ノ井若葉台循環線"];
const STOP_RADIUS_M = 400;
const PERSONS_PER_DOT = 20;

const SOURCES = [
  {
    source_id: "gtfs_nihonkotsu",
    name: "日本交通 GTFS-JP（鳥取県内の全路線）",
    provider: "鳥取県オープンデータポータル 鳥取県バス情報（作成: ジョルダン株式会社）",
    url: "https://odp-pref-tottori.tori-info.co.jp/bus.html",
    file: "gtfs_nihonkotsu.zip",
    date: "2026-11-03",
    license: "鳥取県オープンデータポータル利用規約。個別のライセンス表記なし。規約の既定は CC BY 2.1 JP。確認状態は data/SOURCES.md",
    note: "feed_info: 2026-10-01〜2027-03-31 版。平日 = calendar で月〜金が1のサービス。calendar_dates の例外日は反映していない",
  },
  {
    source_id: "pop_2026_09",
    name: "鳥取市 町別世帯数、年齢（5歳階級）別人口（令和8年9月分・全地区）",
    provider: "鳥取市公式ウェブサイト 総務課",
    url: "https://www.city.tottori.lg.jp/page/50374.html",
    file: "population_2026-09.xlsx",
    date: "2026-11-03",
    license: "鳥取市ウェブサイト利用規約（PDL1.0 準拠）。出典表示と加工表記",
    note: "令和8年9月30日現在の住民登録。町ごとの計の行を使用",
  },
  {
    source_id: "isj_19_0b",
    name: "位置参照情報 大字・町丁目レベル 鳥取県 19.0b",
    provider: "位置参照情報ダウンロードサービス（国土交通省）",
    url: "https://nlftp.mlit.go.jp/isj/",
    file: "isj_31000-19.0b.zip",
    date: "2026-11-03",
    license: "PDL1.0。出典「位置参照情報ダウンロードサービス（国土交通省）」をもとに加工",
    note: "町丁目の代表点。点の配置はこの代表点の周りに人口ぶん散らした想定",
  },
];

const ASSUMPTIONS = {
  note: "ここにある値は出典の無い仮定。画面では「仮定」の札を付けて表示する",
  load_factor_default: 0.3,
  load_factor_range: 0.1,
  alternative_window_min: 30,
  stop_radius_m: STOP_RADIUS_M,
  persons_per_dot: PERSONS_PER_DOT,
  dot_scatter_m: 250,
  purpose_by_age: { 通学: "5-19", 通勤: "20-64", 通院: "65+ の半分", 買い物: "65+ の半分" },
  hour_bands_by_purpose: {
    通学: ["07", "08", "16"],
    通勤: ["07", "08", "17", "18"],
    通院: ["09", "10", "11"],
    買い物: ["10", "11", "14", "15"],
  },
};

// ---------- 小さな道具 ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (c === '"') {
        quoted = false;
        continue;
      }
      cell += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (c === "\r") continue;
    cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift().map((h) => h.replace(/^﻿/, ""));
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
const readGtfs = (name) => parseCsv(readFileSync(`${RAW}/gtfs1/${name}.txt`, "utf8"));
const sha256 = (file) => createHash("sha256").update(readFileSync(`${RAW}/${file}`)).digest("hex");

function distanceM(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// 乱数は種から決める。同じ入力なら同じ town.json になる
function seeded(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const familyOf = (longName) => longName.replace(/^[０-９0-9Ａ-ＺA-Z／/]+/, "");

// ---------- GTFS ----------
const calendar = readGtfs("calendar");
const weekdayServices = new Set(calendar.filter((c) => c.monday === "1" && c.friday === "1").map((c) => c.service_id));
const routesAll = readGtfs("routes").filter((r) => ROUTE_FAMILIES.includes(familyOf(r.route_long_name)));
const routeById = Object.fromEntries(routesAll.map((r) => [r.route_id, r]));
const tripsAll = readGtfs("trips").filter((t) => routeById[t.route_id] && weekdayServices.has(t.service_id));
const tripIds = new Set(tripsAll.map((t) => t.trip_id));
const stopTimes = readGtfs("stop_times").filter((s) => tripIds.has(s.trip_id));
const stopsAll = Object.fromEntries(readGtfs("stops").map((s) => [s.stop_id, s]));

const byTrip = new Map();
for (const st of stopTimes) {
  if (!byTrip.has(st.trip_id)) byTrip.set(st.trip_id, []);
  byTrip.get(st.trip_id).push(st);
}
for (const list of byTrip.values()) list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));

const trips = tripsAll
  .map((t) => {
    const sts = byTrip.get(t.trip_id);
    return {
      trip_id: t.trip_id,
      route_id: t.route_id,
      family: familyOf(routeById[t.route_id].route_long_name),
      headsign: t.trip_headsign,
      departure: sts[0].departure_time.slice(0, 5),
      weekday: true,
      stop_times: sts.map((s) => ({ stop_id: s.stop_id, time: s.departure_time.slice(0, 5) })),
      source_id: "gtfs_nihonkotsu",
    };
  })
  .sort((a, b) => a.departure.localeCompare(b.departure));

const usedStopIds = [...new Set(stopTimes.map((s) => s.stop_id))];
const stops = usedStopIds.map((id) => {
  const s = stopsAll[id];
  return { stop_id: id, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon), source_id: "gtfs_nihonkotsu" };
});
const nearAnyStop = (lat, lon, radius) => stops.some((s) => distanceM(lat, lon, s.lat, s.lon) <= radius);

// ---------- 位置参照情報（町丁目の代表点） ----------
const isjDir = `${RAW}/isj/${readdirSync(`${RAW}/isj`)[0]}`;
const isjCsv = readdirSync(isjDir).find((f) => f.endsWith(".csv"));
const isjRows = parseCsv(new TextDecoder("shift_jis").decode(readFileSync(`${isjDir}/${isjCsv}`))).filter(
  (r) => r["市区町村名"] === "鳥取市",
);
const centroidByName = new Map(
  isjRows.map((r) => [r["大字町丁目名"], { code: r["大字町丁目コード"], lat: Number(r["緯度"]), lon: Number(r["経度"]) }]),
);

// ---------- 鳥取市 町別人口 ----------
const wb = xlsx.read(readFileSync(`${RAW}/population_2026-09.xlsx`));
const grid = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
const normalize = (c) => (typeof c === "string" ? c.replace(/\s/g, "").replace("～", "-").replace("以上", "+") : c);
const headerRow = grid.findIndex((r) => r.some((c) => normalize(c) === "0-4"));
const header = grid[headerRow].map(normalize);
// 5歳階級の列だけ使う。末尾の 0-14・15-64・65- の集計列は除く
const ageCols = header
  .map((h, i) => [h, i])
  .filter(([h]) => /^\d+-\d+$/.test(String(h)) && Number(String(h).split("-")[1]) - Number(String(h).split("-")[0]) === 4);

const populationByName = new Map();
for (let i = headerRow + 1; i < grid.length; i++) {
  const name = grid[i][0]; // 先頭の空列は sheet_to_json が落とすので 0 列目が町名
  if (typeof name !== "string" || !name.trim()) continue;
  const totalRow = grid[i + 2]; // 町ごとに 男・女・計 の3行。計を使う
  if (!totalRow) continue;
  const byAge = Object.fromEntries(ageCols.map(([h, c]) => [h, Number(totalRow[c] ?? 0)]));
  const total = Object.values(byAge).reduce((a, b) => a + b, 0);
  if (total > 0) populationByName.set(name.trim(), { households: Number(grid[i][1] ?? 0), total, byAge });
}

// ---------- 町 → 路線圏の判定 ----------
const districts = [];
const unmatched = [];
for (const [name, pop] of populationByName) {
  const c = centroidByName.get(name);
  if (!c) {
    unmatched.push(name);
    continue;
  }
  if (!nearAnyStop(c.lat, c.lon, STOP_RADIUS_M)) continue;
  districts.push({
    district_id: c.code,
    name,
    households: pop.households,
    population: pop.total,
    population_by_age: pop.byAge,
    centroid: [c.lat, c.lon],
    source_id: "pop_2026_09",
    centroid_source_id: "isj_19_0b",
  });
}

// ---------- 点（1点 = 20人） ----------
const ageSum = (byAge, from, to) =>
  Object.entries(byAge)
    .filter(([k]) => {
      const lo = Number(k.split(/[-+]/)[0]);
      return lo >= from && lo <= to;
    })
    .reduce((a, [, v]) => a + v, 0);

const dots = [];
for (const d of districts) {
  const rnd = seeded(d.district_id);
  const groups = [
    ["通学", ageSum(d.population_by_age, 5, 19)],
    ["通勤", ageSum(d.population_by_age, 20, 64)],
    ["通院", Math.round(ageSum(d.population_by_age, 65, 200) / 2)],
    ["買い物", Math.round(ageSum(d.population_by_age, 65, 200) / 2)],
  ];
  for (const [purpose, n] of groups) {
    const count = Math.round(n / PERSONS_PER_DOT);
    const bands = ASSUMPTIONS.hour_bands_by_purpose[purpose];
    for (let i = 0; i < count; i++) {
      // 代表点の周りに散らす。位置は想定で、個人を表さない
      const ang = rnd() * Math.PI * 2;
      const dist = Math.sqrt(rnd()) * ASSUMPTIONS.dot_scatter_m;
      const lat = d.centroid[0] + (dist * Math.cos(ang)) / 111320;
      const lon = d.centroid[1] + (dist * Math.sin(ang)) / (111320 * Math.cos((d.centroid[0] * Math.PI) / 180));
      dots.push({
        dot_id: `${d.district_id}-${purpose}-${i}`,
        district_id: d.district_id,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        persons: PERSONS_PER_DOT,
        purpose,
        hour_band: bands[Math.floor(rnd() * bands.length)],
        source_id: "pop_2026_09",
      });
    }
  }
}

// ---------- 架空の住民3人。位置は町の代表点に固定。姓は地名と重ねない ----------
function residentDistrict(name) {
  const d = districts.find((x) => x.name === name);
  if (!d) throw new Error(`住民の町が路線圏に無い: ${name}`);
  return d;
}
const residents = [
  {
    id: "r1",
    name: "佐伯 ひな",
    age: 17,
    role: "高校生",
    district: "若葉台南三丁目",
    purpose: "通学",
    hour_band: "07",
    lines: {
      default: "7時台の便で駅まで出て、そこから学校へ乗り継いでいます。",
      affected: "その便が無くなると、次は1時間後。1限に間に合いません。",
      relieved: "その便は残るんですね。朝はいつも通りで大丈夫です。",
    },
  },
  {
    id: "r2",
    name: "岡本 清",
    age: 78,
    role: "通院",
    district: "雲山",
    purpose: "通院",
    hour_band: "09",
    lines: {
      default: "月に2回、9時台の便で市立病院へ行きます。",
      affected: "9時台が無いと、予約の時間に着けません。タクシーは毎回は無理です。",
      relieved: "9時台が残るなら、今までと同じに通えます。",
    },
  },
  {
    id: "r3",
    name: "三好 恵",
    age: 46,
    role: "看護師（夜勤あり）",
    district: "南吉方三丁目",
    purpose: "通勤",
    hour_band: "09",
    lines: {
      default: "夜勤明けは9時台の便で帰ります。車は眠くて運転したくない。",
      affected: "9時台を外すと、夜勤明けに1時間待つことになります。",
      relieved: "9時台を残してくれたのは助かります。",
    },
  },
].map((r) => {
  const d = residentDistrict(r.district);
  return {
    ...r,
    district_id: d.district_id,
    lat: d.centroid[0],
    lon: d.centroid[1],
    fictional: true,
    source_id: "pop_2026_09",
    source_note: "年齢と目的はその町の年齢構成から選んだ架空の人物。実在しない",
  };
});

const town = {
  meta: {
    built_at: new Date().toISOString().slice(0, 10),
    area: "鳥取市",
    route_families: ROUTE_FAMILIES,
    sources: SOURCES.map((s) => ({ ...s, sha256: sha256(s.file) })),
    counts: {
      routes: routesAll.length,
      trips: trips.length,
      stops: stops.length,
      districts: districts.length,
      dots: dots.length,
      unmatched_districts: unmatched.length,
    },
  },
  routes: routesAll.map((r) => ({
    route_id: r.route_id,
    name: r.route_long_name,
    family: familyOf(r.route_long_name),
    source_id: "gtfs_nihonkotsu",
  })),
  stops,
  trips,
  districts,
  dots,
  residents,
  assumptions: ASSUMPTIONS,
};

writeFileSync("data/town.json", JSON.stringify(town, null, 1) + "\n");
console.log(
  `town.json: routes ${routesAll.length}, trips ${trips.length}, stops ${stops.length}, districts ${districts.length}, dots ${dots.length}`,
);
if (unmatched.length) console.log(`位置参照に無い町 ${unmatched.length} 件（例: ${unmatched.slice(0, 8).join("、")}）`);
