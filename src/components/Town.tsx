"use client";
// 町を歩く画面。描画は TownScene、ここは HUD と会話・詳細・案の UI
import { useEffect, useRef, useState } from "react";
import { clockText, type Note, type Spot, type Target, type World } from "@/lib/world";
import { withBase } from "@/lib/base";
import type { TownScene } from "./town/TownScene";

type Props = { world: World };
type Answer = { spot: Spot; option: string; note: Note };
type Panel = { type: "npc"; name: string; role: string; lines: string[]; i: number } | { type: "spot"; spot: Spot; chosen?: Answer } | { type: "end" } | null;

export function Town({ world }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TownScene | null>(null);
  const [ready, setReady] = useState(false);
  const [minutes, setMinutes] = useState(world.meta.clock.start_hour * 60);
  const [target, setTarget] = useState<Target | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [talked, setTalked] = useState<string[]>([]);
  // 閉じた直後の Space で同じ相手をまた開かないように
  const closedAt = useRef(0);
  const endHour = world.meta.clock.end_hour;

  useEffect(() => {
    let scene: TownScene | null = null;
    let alive = true;
    import("./town/TownScene").then(({ TownScene }) => {
      if (!alive || !canvasRef.current) return;
      scene = new TownScene(canvasRef.current, world, (s) => {
        setMinutes(s.minutes);
        setTarget(s.target);
      });
      sceneRef.current = scene;
      if (location.search.includes("debug")) (window as unknown as { __town: TownScene }).__town = scene;
      scene.start().then(() => setReady(true));
    });
    return () => {
      alive = false;
      scene?.dispose();
    };
  }, [world]);

  // 17 時か、案が 3 つで終業
  useEffect(() => {
    if (panel?.type === "end") return;
    if (minutes >= endHour * 60 || answers.length >= 3) {
      setPanel({ type: "end" });
      sceneRef.current?.setPaused(true);
    }
  }, [minutes, answers.length, endHour, panel?.type]);

  function open(t: Target) {
    sceneRef.current?.setPaused(true);
    if (t.type === "npc") {
      setTalked((prev) => (prev.includes(t.npc.id) ? prev : [...prev, t.npc.id]));
      setPanel({ type: "npc", name: t.npc.name, role: t.npc.role, lines: t.npc.lines, i: 0 });
      return;
    }
    setTalked((prev) => (prev.includes(t.spot.id) ? prev : [...prev, t.spot.id]));
    setPanel({ type: "spot", spot: t.spot, chosen: answers.find((a) => a.spot.id === t.spot.id) });
  }

  function close() {
    closedAt.current = performance.now();
    setPanel(null);
    sceneRef.current?.setPaused(false);
  }

  function choose(spot: Spot, text: string, note: Note) {
    const a = { spot, option: text, note };
    setAnswers((prev) => [...prev.filter((x) => x.spot.id !== spot.id), a]);
    sceneRef.current?.markAnswered(spot.id);
    setPanel({ type: "spot", spot, chosen: a });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (panel?.type === "npc") {
        e.preventDefault();
        if (panel.i + 1 < panel.lines.length) setPanel({ ...panel, i: panel.i + 1 });
        else close();
        return;
      }
      if (!panel && target) {
        e.preventDefault();
        if (performance.now() - closedAt.current < 400) return;
        open(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hold = (dir: [number, number]) => ({
    onPointerDown: () => sceneRef.current?.setTouchDir(dir),
    onPointerUp: () => sceneRef.current?.setTouchDir([0, 0]),
    onPointerLeave: () => sceneRef.current?.setTouchDir([0, 0]),
  });

  return (
    <div className="town">
      <canvas ref={canvasRef} className="town-canvas" />
      {!ready && <div className="town-loading">町を組み立てています…</div>}

      <div className="hud">
        <span className="hud-clock">{clockText(minutes)}</span>
        <span className="hud-quests">案 {answers.length}/3</span>
        <span className="muted">{endHour}:00 で終業</span>
      </div>

      {!panel && target && (
        <button className="prompt" onClick={() => open(target)}>
          {target.type === "npc" ? `${target.npc.name}に話す` : `${target.spot.title}を見る`} <kbd>Space</kbd>
        </button>
      )}

      <div className="dpad" aria-label="移動">
        <button {...hold([0, -1])} className="dpad-up">↑</button>
        <button {...hold([-1, 0])} className="dpad-left">←</button>
        <button {...hold([1, 0])} className="dpad-right">→</button>
        <button {...hold([0, 1])} className="dpad-down">↓</button>
      </div>

      {panel?.type === "npc" && (
        <div className="talk" onClick={() => (panel.i + 1 < panel.lines.length ? setPanel({ ...panel, i: panel.i + 1 }) : close())}>
          <div className="talk-name">
            {panel.name} <span className="muted">{panel.role}</span>
          </div>
          <p>{panel.lines[panel.i]}</p>
          <div className="talk-next">{panel.i + 1 < panel.lines.length ? "▼" : "閉じる"}</div>
        </div>
      )}

      {panel?.type === "spot" && <SpotPanel spot={panel.spot} chosen={panel.chosen} world={world} onChoose={choose} onClose={close} />}

      {panel?.type === "end" && (
        <div className="sheet end">
          <h2>今日はここまで</h2>
          <p className="muted">
            {clockText(minutes)}。話した相手 {talked.length}、出した案 {answers.length}。
          </p>
          {answers.length === 0 && <p>白兎「今日は歩いただけでも、町の見え方は変わったはず。明日は一言でいいから案を出してみて」</p>}
          {answers.map((a) => (
            <div key={a.spot.id} className="end-row">
              <strong>{a.spot.title}</strong>
              <div>{a.option}</div>
              <div className="muted">抜け: {a.note.gap}</div>
              <div className="muted">
                届け先: <a href={a.spot.window.url} target="_blank" rel="noreferrer">{a.spot.window.name}</a>
              </div>
            </div>
          ))}
          <button className="btn submit" onClick={() => location.reload()}>
            もう一度、初日から
          </button>
        </div>
      )}
    </div>
  );
}

function SpotPanel({ spot, chosen, world, onChoose, onClose }: { spot: Spot; chosen?: Answer; world: World; onChoose: (s: Spot, t: string, n: Note) => void; onClose: () => void }) {
  return (
    <div className="sheet spot">
      <button className="close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <h2>{spot.title}</h2>
      <h3>なんでこうなってる</h3>
      <p>{spot.why}</p>
      {spot.facts.length > 0 && (
        <ul className="facts">
          {spot.facts.map((f) => {
            const s = world.sources[f.source];
            return (
              <li key={f.text}>
                {f.text}{" "}
                <a className="chip" href={s.url} target="_blank" rel="noreferrer" title={s.note}>
                  出典: {s.name}（{s.date}）
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {spot.facts.length === 0 && <p className="muted small">この話は架空。数字は出典が取れたものだけ書く。いまは無い</p>}

      <h3>依頼: {spot.quest.ask}</h3>
      {!chosen && (
        <div className="options">
          {spot.quest.options.map((o) => (
            <button key={o.text} className="option" onClick={() => onChoose(spot, o.text, o.note)}>
              {o.text}
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <>
          <p className="chosen">あなたの一言: {chosen.option}</p>
          <div className="notes">
            <div className="note good">
              <span className="pill">良い点</span> {chosen.note.good}
            </div>
            <div className="note gap">
              <span className="pill">抜け</span> {chosen.note.gap}
            </div>
            <div className="note question">
              <span className="pill">問い</span> {chosen.note.question}
            </div>
          </div>
          <p className="muted small">この付箋は、案ごとに Claude が事前に書いたもの。手元版では確認役が提出文を読んで書く</p>
          <div className="window">
            もっと知りたい・届けたい: <a href={spot.window.url} target="_blank" rel="noreferrer">{spot.window.name}</a>
            <span className="muted small">（{spot.window.checked} 確認）</span>
          </div>
          {spot.deeper && (
            <a className="btn deeper" href={withBase(spot.deeper.href)}>
              {spot.deeper.label}
            </a>
          )}
        </>
      )}
    </div>
  );
}
