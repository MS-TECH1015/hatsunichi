"use client";
import { useState } from "react";
import type { Impact, Town, Trip } from "@/lib/impact";
import { CLOCK_DIGITS, digitsOf, type Note, type Submission } from "@/lib/review";
import { SourceChip, type SourceMeta } from "./SourceChip";

type Round = { submission: Submission; note: Note; persons: Impact["persons"] };

type Props = {
  town: Town;
  removedTrips: Trip[];
  impact: Impact;
  load: number;
  source?: SourceMeta;
};

export function SubmissionForm({ town, removedTrips, impact, load, source }: Props) {
  const [reason, setReason] = useState("");
  const [affected, setAffected] = useState("");
  const [alternative, setAlternative] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [savedVoice, setSavedVoice] = useState<string | null>(null);

  // 用紙に書いた数字のうち、計算結果に無いもの。赤枠で示すが提出は止めない
  const known = digitsOf(`${impact.persons.low} ${impact.persons.mid} ${impact.persons.high} ${impact.dots.length} ${load} ${town.assumptions.persons_per_dot} ${removedTrips.map((t) => t.departure).join(" ")} ${CLOCK_DIGITS.join(" ")}`);
  const strayNumbers = [...digitsOf(affected)].filter((n) => !known.has(n));

  async function submit() {
    setBusy(true);
    setError(null);
    const submission: Submission = {
      removed: removedTrips.map((t) => ({ trip_id: t.trip_id, family: t.family, departure: t.departure, headsign: t.headsign })),
      reason,
      affected,
      alternative,
    };
    try {
      const res = await fetch("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submission, load_factor: load }) });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const data = (await res.json()) as { note: Note };
      setRounds((prev) => [...prev, { submission, note: data.note, persons: impact.persons }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function saveVoice() {
    if (!agreed || !voice.trim()) return;
    try {
      const list = JSON.parse(localStorage.getItem("hatsunichi.voices") ?? "[]") as string[];
      localStorage.setItem("hatsunichi.voices", JSON.stringify([...list, voice.trim()]));
    } catch {
      // 保存できない環境でも画面は進める
    }
    setSavedVoice(voice.trim());
  }

  const last = rounds.at(-1);
  const first = rounds[0];

  return (
    <section className="sheet">
      <>
          <h3>提出用紙 <span className="muted">{rounds.length === 0 ? "1回目" : `${rounds.length + 1}回目`}</span></h3>
          <label className="field">
            <span>減らす便</span>
            <div className="removed-list">
              {removedTrips.length === 0 && <span className="muted">便一覧で「外す」を押すとここに入る</span>}
              {removedTrips.map((t) => <span key={t.trip_id} className="pill">{t.departure} {t.family}→{t.headsign}</span>)}
            </div>
          </label>
          <label className="field">
            <span>理由</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="なぜこの便か" />
          </label>
          <label className={strayNumbers.length ? "field stray" : "field"}>
            <span>
              影響を受ける人 <SourceChip source={source} formula="灯った点 × 1点の人数 × 乗車率" />
              <span className="muted"> 計算では {impact.persons.low}〜{impact.persons.high}人</span>
            </span>
            <textarea value={affected} onChange={(e) => setAffected(e.target.value)} rows={2} placeholder="誰が、いつ、どれくらい" />
            {strayNumbers.length > 0 && <span className="warn">出典の無い数字: {strayNumbers.join("、")}。提出はできるが、付箋で指摘される</span>}
          </label>
          <label className="field">
            <span>代替案</span>
            <textarea value={alternative} onChange={(e) => setAlternative(e.target.value)} rows={2} placeholder="外した便の利用者はどうするか" />
          </label>
          <button type="button" className="btn submit" disabled={busy || removedTrips.length === 0} onClick={submit}>
            {busy ? "確認役が読んでいる…" : rounds.length === 0 ? "提出する" : "もう一度提出する"}
          </button>
          {error && <p className="warn">{error}</p>}

          {last && (
            <div className="notes">
              <div className="note good"><b>良い点</b>{last.note.good}</div>
              <div className="note gap"><b>抜け</b>{last.note.gap}</div>
              <div className="note question"><b>問い</b>{last.note.question}</div>
              <div className="muted small">
                確認役 {last.note.demo ? "demo（鍵なしの固定文）" : last.note.model}・数字の照合で作り直し {last.note.retries}回
              </div>
            </div>
          )}
          {rounds.length >= 2 && first && last && (
            <div className="diff">
              1回目 → {rounds.length}回目: 影響 {first.persons.low}〜{first.persons.high}人 → {last.persons.low}〜{last.persons.high}人、外した便 {first.submission.removed.length} → {last.submission.removed.length}
            </div>
          )}
          {rounds.length > 0 && (
            <div className="voice">
              <label className="field">
                <span>ひとこと（任意）</span>
                <input value={voice} onChange={(e) => setVoice(e.target.value)} maxLength={80} placeholder="やってみてどうだったか、1行" />
              </label>
              <label className="agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> この一言だけ匿名で残してよい
              </label>
              <button type="button" className="btn" disabled={!agreed || !voice.trim()} onClick={saveVoice}>残す</button>
              {savedVoice && <span className="muted small"> 残した: 「{savedVoice}」</span>}
            </div>
          )}
      </>
    </section>
  );
}
