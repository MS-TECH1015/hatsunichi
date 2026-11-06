"use client";
import { useMemo, useState } from "react";
import { impactOf, residentState, ridersOfTrip, type Resident, type ResidentState, type Town, type Trip } from "@/lib/impact";
import type { Ticket } from "@/lib/ticket";
import { busesAt } from "@/lib/busPosition";
import { SourceChip, type SourceMeta } from "./SourceChip";
import { TownMap } from "./TownMap";
import { MAP_REVIEW_URL, SubmissionForm } from "./SubmissionForm";

type Meta = { built_at: string; sources: SourceMeta[]; counts: Record<string, number> };

const FORMULA = "停留所圏 400m の人口の点 × 時間帯の一致 × 乗車率";

export function Workbench({ town, meta, tickets }: { town: Town; meta: Meta; tickets: Ticket[] }) {
  const [week, setWeek] = useState(0);
  const ticket = tickets[week] ?? tickets[0];
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [load, setLoad] = useState(town.assumptions.load_factor_default);
  const [spoken, setSpoken] = useState<Resident | null>(null);
  const [clock, setClock] = useState(9 * 60 + 5);

  const impact = useMemo(() => impactOf(town, removed, load), [town, removed, load]);
  const buses = useMemo(() => busesAt(town, removed, clock), [town, removed, clock]);
  const clockLabel = `${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}`;
  const riders = useMemo(() => Object.fromEntries(town.trips.map((t) => [t.trip_id, ridersOfTrip(town, t, load)])), [town, load]);
  const residentStates = useMemo(
    () => Object.fromEntries(town.residents.map((r) => [r.id, residentState(town, removed, r)])) as Record<string, ResidentState>,
    [town, removed],
  );
  const source = (id: string) => meta.sources.find((s) => s.source_id === id);

  function toggle(trip: Trip) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(trip.trip_id)) next.delete(trip.trip_id);
      else next.add(trip.trip_id);
      return next;
    });
  }

  return (
    <div className="shell">
      <header className="band">
        <span>時刻表は公開データ、依頼は架空</span>
        <span className="band-sub">鳥取市・{town.trips.length}便・点は町ごとの人口を置いた想定</span>
      </header>

      <main className="main">
        <section className="map-area">
          <TownMap town={town} affected={impact.dots} buses={buses} residentStates={residentStates} onResidentClick={setSpoken} />
          <div className="clock-card">
            <label>
              <span className="mono">{clockLabel}</span> 走っているバス {buses.length}台
              <input type="range" min={5 * 60} max={21 * 60} step={1} value={clock} onChange={(e) => setClock(Number(e.target.value))} />
            </label>
          </div>
          <div className="ticket-card">
            <div className="ticket-title">
              依頼票 <span className="chip chip-assumed">架空</span>
              <span className="tabs inline">
                {tickets.map((tk, i) => (
                  <button key={tk.file} type="button" className={week === i ? "tab on" : "tab"} onClick={() => setWeek(i)}>第{i + 1}週</button>
                ))}
                {tickets.length < 2 && <span className="tab muted">第2週 依頼票はまだ無い</span>}
              </span>
            </div>
            <dl>
              <dt>路線</dt><dd>{ticket.route}</dd>
              <dt>依頼</dt><dd>{ticket.request}</dd>
              <dt>条件</dt><dd>{ticket.condition}</dd>
              <dt>期限</dt><dd>{ticket.deadline}</dd>
            </dl>
          </div>
          <div className="impact-card">
            <div className="impact-num">
              影響 {impact.persons.low}〜{impact.persons.high}人／日 <span className="chip chip-assumed">想定</span>
            </div>
            <div className="impact-sub">
              灯った点 {impact.dots.length}（1点 {town.assumptions.persons_per_dot}人）・外した便 {removed.size}
              <SourceChip source={source("pop_2026_09")} formula={FORMULA} />
            </div>
          </div>
          {spoken && (
            <div className="resident-card">
              <div className="resident-head">
                {spoken.name}（{spoken.age}、{spoken.role}） <span className="chip chip-assumed">架空</span>
                <SourceChip source={source("pop_2026_09")} label="年齢構成の出典" />
                <button type="button" className="close" onClick={() => setSpoken(null)} aria-label="閉じる">×</button>
              </div>
              <p>{spoken.lines[residentStates[spoken.id]]}</p>
              <p className="resident-calc">計算: {spoken.hour_band}時台・停留所圏 {town.assumptions.stop_radius_m}m・代替便 ±{town.assumptions.alternative_window_min}分 → {residentStates[spoken.id] === "affected" ? "影響あり" : "影響なし"}</p>
            </div>
          )}
        </section>

        <aside className="panel">
          <div className="panel-head">
            <h2>便一覧 <SourceChip source={source("gtfs_nihonkotsu")} /></h2>
            <label className="slider">
              乗車率 {load.toFixed(2)} <span className="chip chip-assumed">仮定</span>
              <input type="range" min={0.1} max={0.8} step={0.05} value={load} onChange={(e) => setLoad(Number(e.target.value))} />
            </label>
            <div className="formula">{FORMULA}</div>
          </div>
          <table className="trips">
            <thead>
              <tr><th>発</th><th>路線・行先</th><th>想定利用者</th><th></th></tr>
            </thead>
            <tbody>
              {town.trips.map((t) => {
                const off = removed.has(t.trip_id);
                const r = riders[t.trip_id];
                return (
                  <tr key={t.trip_id} className={off ? "off" : ""}>
                    <td className="mono">{t.departure}</td>
                    <td>{t.family}<span className="muted"> → {t.headsign}</span></td>
                    <td className="mono">{r.high === 0 ? <span className="muted">代替あり</span> : `${r.low}〜${r.high}`}</td>
                    <td><button type="button" className={off ? "btn on" : "btn"} onClick={() => toggle(t)}>{off ? "戻す" : "外す"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <SubmissionForm
            key={ticket.file}
            town={town}
            removedTrips={town.trips.filter((t) => removed.has(t.trip_id))}
            impact={impact}
            load={load}
            source={source("pop_2026_09")}
          />
        </aside>
      </main>

      <footer className="foot">
        <span>{MAP_REVIEW_URL ? "提出用紙は手元の確認役のサーバーへ送る" : "提出用紙はどこにも送らず、決まった文の付箋を画面の中で付ける"}。一言は同意したときだけ、このブラウザに残す</span>
        <span>事業者とは無関係の個人制作。時刻表: 鳥取県オープンデータポータル 鳥取県バス情報（日本交通 GTFS-JP）を加工。人口: 出典：鳥取市公式ウェブサイト。町の代表点: 大字・町丁目位置参照情報 19.0b（国土交通省）をもとに作成。地図: 地理院タイル。生成 {meta.built_at}</span>
      </footer>
    </div>
  );
}
