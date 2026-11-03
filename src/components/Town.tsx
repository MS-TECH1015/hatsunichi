"use client";
// 町を歩く画面。描画は TownScene、ここはタイトル・HUD・会話・依頼の選択・判子・詳細の UI。
// 画面に出す文字は一言ずつにし、理由・出典・付箋・窓口は「くわしく」の中に置く
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clockText, targetAt, type Note, type Option, type Place, type Spot, type Target, type World } from "@/lib/world";
import { withBase } from "@/lib/base";
import type { TownScene } from "./town/TownScene";
import { play, setMuted } from "./town/sfx";

type Props = { world: World };
type Answer = { spot: Spot; option: string; label: string; note: Note };
type Stage = "hint" | "ask" | "result";
type Panel =
  | { type: "talk"; speaker: string; role?: string; lines: string[]; i: number }
  | { type: "spot"; spot: Spot; stage: Stage; detail?: boolean }
  | { type: "bus"; from: Place }
  | { type: "ride"; to: Place; minutes: number }
  | { type: "end" }
  | null;

const MUTE_KEY = "hatsunichi-muted";

export function Town({ world }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TownScene | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [minutes, setMinutes] = useState(world.meta.clock.start_hour * 60);
  const [target, setTarget] = useState<Target | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [talked, setTalked] = useState<string[]>([]);
  const [muted, setMute] = useState(false);
  const [stampedId, setStampedId] = useState<string | null>(null);
  const [bigMap, setBigMap] = useState(false);
  // 閉じた直後の Space で同じ相手をまた開かないように
  const closedAt = useRef(0);
  const { start_hour, end_hour } = world.meta.clock;
  const rabbit = world.npcs.find((n) => n.kind === "rabbit");
  const guide = rabbit?.name ?? "白兎";

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

  useEffect(() => {
    try {
      const m = localStorage.getItem(MUTE_KEY) === "1";
      setMute(m);
      setMuted(m);
    } catch {
      // 保存できない環境では毎回音ありで始める
    }
  }, []);

  useEffect(() => {
    if (started) sceneRef.current?.attachMap(mapRef.current);
  }, [started]);

  // 17 時を過ぎるか、案が 3 つそろって会話を閉じたら終業
  useEffect(() => {
    if (!started || panel) return;
    if (minutes < end_hour * 60 && answers.length < 3) return;
    setPanel({ type: "end" });
    sceneRef.current?.setPaused(true);
    play("end");
  }, [started, panel, minutes, answers.length, end_hour]);

  function begin() {
    if (!ready || started) return;
    play("start");
    setStarted(true);
    sceneRef.current?.play();
    if (!rabbit) {
      sceneRef.current?.setPaused(false);
      return;
    }
    sceneRef.current?.markTalked(rabbit.id);
    setTalked([rabbit.id]);
    // カメラが降りきってから白兎が話しかける
    window.setTimeout(() => setPanel({ type: "talk", speaker: rabbit.name, role: rabbit.role, lines: rabbit.lines, i: 0 }), 1700);
  }

  function open(t: Target) {
    sceneRef.current?.setPaused(true);
    sceneRef.current?.faceTo(targetAt(t));
    play("open");
    if (t.type === "bus") {
      setPanel({ type: "bus", from: t.place });
      return;
    }
    if (t.type === "npc") {
      sceneRef.current?.markTalked(t.npc.id);
      setTalked((prev) => (prev.includes(t.npc.id) ? prev : [...prev, t.npc.id]));
      setPanel({ type: "talk", speaker: t.npc.name, role: t.npc.role, lines: t.npc.lines, i: 0 });
      return;
    }
    const done = answers.some((a) => a.spot.id === t.spot.id);
    setPanel({ type: "spot", spot: t.spot, stage: done ? "result" : "hint" });
  }

  function close() {
    closedAt.current = performance.now();
    setPanel(null);
    sceneRef.current?.setPaused(false);
  }

  /** バスで別の町へ。走っているあいだは行き先の札だけ出す */
  async function ride(from: Place, to: Place) {
    const info = sceneRef.current?.routeInfo(from.id, to.id);
    if (!info) return;
    play("choose");
    setPanel({ type: "ride", to, minutes: info.minutes });
    await sceneRef.current?.rideTo(from.id, to.id);
    play("open");
    close();
  }

  function choose(spot: Spot, o: Option) {
    play("choose");
    setAnswers((prev) => [...prev.filter((x) => x.spot.id !== spot.id), { spot, option: o.text, label: o.label, note: o.note }]);
    sceneRef.current?.markAnswered(spot.id);
    setStampedId(spot.id);
    window.setTimeout(() => play("stamp"), 300);
    setPanel({ type: "spot", spot, stage: "result" });
  }

  function toggleMute() {
    const m = !muted;
    setMute(m);
    setMuted(m);
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // 保存できなくても、この回の切り替えは効く
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (!started) {
        e.preventDefault();
        begin();
        return;
      }
      if (panel || !target) return;
      e.preventDefault();
      if (performance.now() - closedAt.current < 400) return;
      open(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hold = (dir: [number, number]) => ({
    onPointerDown: () => sceneRef.current?.setTouchDir(dir),
    onPointerUp: () => sceneRef.current?.setTouchDir([0, 0]),
    onPointerLeave: () => sceneRef.current?.setTouchDir([0, 0]),
  });

  const answerOf = (spot: Spot) => answers.find((a) => a.spot.id === spot.id);
  const day = Math.min(Math.max((minutes - start_hour * 60) / ((end_hour - start_hour) * 60), 0), 1);
  const people = talked.filter((id) => world.npcs.some((n) => n.id === id)).length;

  return (
    <div className="town">
      <canvas ref={canvasRef} className="town-canvas" />

      {!started && (
        <div className="title">
          <h1 className="logo">はつにち</h1>
          <p className="tagline">鳥取市で、仕事の初日。</p>
          <button className="btn-game big" disabled={!ready} onClick={begin}>
            {ready ? "はじめる" : "よみこみ中…"}
          </button>
          <p className="title-keys">
            <kbd>←↑↓→</kbd> 歩く　<kbd>Shift</kbd> 走る　<kbd>Space</kbd> 話す
          </p>
          <p className="title-note">
            人・店・相談は架空。地名と地形は実在。数字は出典つき
            <br />
            地形: 国土地理院 標高タイルを加工 ・ 市の境: 国土数値情報（行政区域）を加工
          </p>
        </div>
      )}

      {started && (
        <div className="hud">
          <div className="hud-clock">
            <SunIcon />
            <span>{clockText(minutes)}</span>
            <span className="hud-day" aria-hidden>
              <span style={{ width: `${day * 100}%` }} />
            </span>
          </div>
          <div className="hud-stamps" aria-label={`案 ${answers.length}/3`}>
            {[0, 1, 2].map((i) => (
              <Stamp key={i} char={answers[i]?.spot.stamp} pop={answers[i]?.spot.id === stampedId} />
            ))}
          </div>
          <button className="hud-sound" onClick={toggleMute} aria-label={muted ? "音を出す" : "音を消す"}>
            <SoundIcon muted={muted} />
          </button>
        </div>
      )}

      {started && !panel && target && (
        <button className="prompt" onClick={() => open(target)}>
          <kbd>Space</kbd>
          {target.type === "npc" ? `${target.npc.name}と話す` : target.type === "bus" ? "バスに乗る" : "しらべる"}
        </button>
      )}

      {started && (
        <div className={bigMap ? "minimap big" : "minimap"}>
          <canvas ref={mapRef} onClick={() => setBigMap(!bigMap)} aria-label="鳥取市の地図" />
          <small>国土地理院・国土数値情報を加工</small>
        </div>
      )}

      {started && (
        <div className="dpad" aria-label="移動">
          <button {...hold([0, -1])} className="dpad-up" aria-label="上">▲</button>
          <button {...hold([-1, 0])} className="dpad-left" aria-label="左">◀</button>
          <button {...hold([1, 0])} className="dpad-right" aria-label="右">▶</button>
          <button {...hold([0, 1])} className="dpad-down" aria-label="下">▼</button>
        </div>
      )}

      {panel?.type === "talk" && (
        <Dialog
          speaker={panel.speaker}
          role={panel.role}
          text={panel.lines[panel.i]}
          last={panel.i + 1 >= panel.lines.length}
          onNext={() => (panel.i + 1 < panel.lines.length ? setPanel({ ...panel, i: panel.i + 1 }) : close())}
        />
      )}

      {panel?.type === "spot" && (
        <SpotView
          spot={panel.spot}
          stage={panel.stage}
          detail={panel.detail === true}
          answer={answerOf(panel.spot)}
          guide={guide}
          world={world}
          onStage={(stage) => setPanel({ ...panel, stage })}
          onDetail={(detail) => {
            play(detail ? "open" : "talk");
            setPanel({ ...panel, detail });
          }}
          onChoose={choose}
          onClose={close}
        />
      )}

      {panel?.type === "bus" && (
        <BusView
          from={panel.from}
          places={world.places.filter((p) => p.hub && p.id !== panel.from.id)}
          minutesTo={(to) => sceneRef.current?.routeInfo(panel.from.id, to.id)?.minutes ?? null}
          onRide={(to) => ride(panel.from, to)}
          onClose={close}
        />
      )}

      {panel?.type === "ride" && (
        <div className="ride-sign">
          <span>{panel.to.name}</span> 行き ・ {panel.minutes}分
        </div>
      )}

      {panel?.type === "end" && (
        <div className="end">
          <div className="end-card">
            <h2>初日、おつかれさま</h2>
            <div className="end-stamps">
              {[0, 1, 2].map((i) => (
                <Stamp key={i} char={answers[i]?.spot.stamp} big />
              ))}
            </div>
            {answers.length === 0 && <p className="end-line">{guide}「明日は一言でいいから、案を出してみよう」</p>}
            <ul className="end-list">
              {answers.map((a) => (
                <li key={a.spot.id}>
                  <Stamp char={a.spot.stamp} />
                  <span className="end-label">{a.label}</span>
                  <a href={a.spot.window.url} target="_blank" rel="noreferrer">
                    届け先
                  </a>
                </li>
              ))}
            </ul>
            <p className="end-meta">
              {clockText(minutes)} ・ 話した人 {people}
            </p>
            <button className="btn-game" onClick={() => location.reload()}>
              もう一度
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** バス停で行き先を選ぶ。数字キーでも選べる */
function BusView({ from, places, minutesTo, onRide, onClose }: { from: Place; places: Place[]; minutesTo: (to: Place) => number | null; onRide: (to: Place) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const p = places[Number(e.key) - 1];
      if (p) onRide(p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [places, onRide, onClose]);

  return (
    <>
      <div className="choices bus">
        {places.map((p, i) => (
          <button key={p.id} className="choice" onClick={() => onRide(p)} onMouseEnter={() => play("select", 0.2)}>
            <kbd>{i + 1}</kbd>
            {p.name}
            <small>{minutesTo(p)}分</small>
          </button>
        ))}
        <button className="choice why" onClick={onClose}>
          やめる
        </button>
      </div>
      <Dialog speaker={`${from.name}のバス停`} text="どこへ行く？" />
    </>
  );
}

/** 下に出る会話の箱。一文字ずつ出し、Space かクリックで送る */
function Dialog({ speaker, role, text, onNext, last, children }: { speaker?: string; role?: string; text: string; onNext?: () => void; last?: boolean; children?: ReactNode }) {
  const [n, setN] = useState(0);
  const done = n >= text.length;

  useEffect(() => {
    setN(0);
    const id = window.setInterval(() => setN((k) => Math.min(k + 1, text.length)), 32);
    return () => window.clearInterval(id);
  }, [text]);

  const advance = useCallback(() => {
    if (!done) {
      setN(text.length);
      return;
    }
    if (!onNext) return;
    play("talk");
    onNext();
  }, [done, text.length, onNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  return (
    <div className="dialog" onClick={advance}>
      {speaker && (
        <div className="dialog-name">
          {speaker}
          {role && <small>{role}</small>}
        </div>
      )}
      <p className="dialog-text">
        {text.slice(0, n)}
        <span className="dialog-rest">{text.slice(n)}</span>
      </p>
      {done && onNext && <span className="dialog-next">{last ? "■" : "▼"}</span>}
      {children}
    </div>
  );
}

type SpotViewProps = {
  spot: Spot;
  stage: Stage;
  detail: boolean;
  answer?: Answer;
  guide: string;
  world: World;
  onStage: (s: Stage) => void;
  onDetail: (open: boolean) => void;
  onChoose: (s: Spot, o: Option) => void;
  onClose: () => void;
};

/** 調べる → 頼まれる → 選ぶ → 判子と問い。理由と出典は「くわしく」に */
function SpotView({ spot, stage, detail, answer, guide, world, onStage, onDetail, onChoose, onClose }: SpotViewProps) {
  useEffect(() => {
    if (stage !== "ask" || detail) return;
    const onKey = (e: KeyboardEvent) => {
      const o = spot.quest.options[Number(e.key) - 1];
      if (o) onChoose(spot, o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, detail, spot, onChoose]);

  if (detail) return <Detail spot={spot} answer={answer} world={world} onClose={() => onDetail(false)} />;

  if (stage === "hint") return <Dialog text={spot.hint} onNext={() => onStage("ask")} />;

  if (stage === "ask")
    return (
      <>
        <div className="choices">
          {spot.quest.options.map((o, i) => (
            <button key={o.label} className="choice" onClick={() => onChoose(spot, o)} onMouseEnter={() => play("select", 0.2)}>
              <kbd>{i + 1}</kbd>
              {o.label}
            </button>
          ))}
          <button className="choice why" onClick={() => onDetail(true)}>
            なんで？
          </button>
        </div>
        <Dialog speaker={spot.asker} text={spot.quest.ask} />
      </>
    );

  if (!answer) return null;
  return (
    <>
      <div className="result">
        <Stamp char={spot.stamp} big pop />
        <div className="result-label">{answer.label}</div>
      </div>
      <Dialog speaker={guide} text={answer.note.question} onNext={onClose} last>
        <div className="dialog-actions">
          <button
            className="btn-game small ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDetail(true);
            }}
          >
            くわしく
          </button>
          <button
            className="btn-game small"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            とじる
          </button>
        </div>
      </Dialog>
    </>
  );
}

/** くわしく。なんでこうなってるか、出典、付箋、窓口 */
function Detail({ spot, answer, world, onClose }: { spot: Spot; answer?: Answer; world: World; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="detail" role="dialog" aria-label={spot.title}>
      <button className="detail-close" onClick={onClose} aria-label="もどる">
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

      {answer && (
        <>
          <h3>あなたの案</h3>
          <p className="chosen">{answer.option}</p>
          <div className="notes">
            <div className="note good">
              <span className="pill">良い点</span> {answer.note.good}
            </div>
            <div className="note gap">
              <span className="pill">抜け</span> {answer.note.gap}
            </div>
            <div className="note question">
              <span className="pill">問い</span> {answer.note.question}
            </div>
          </div>
          <p className="muted small">この付箋は、案ごとに Claude が事前に書いたもの。手元版では確認役が提出文を読んで書く</p>
        </>
      )}

      <h3>届け先</h3>
      <p>
        <a href={spot.window.url} target="_blank" rel="noreferrer">
          {spot.window.name}
        </a>{" "}
        <span className="muted small">{spot.window.checked} 確認</span>
      </p>
      {spot.deeper && (
        <a className="btn-game small ghost" href={withBase(spot.deeper.href)}>
          {spot.deeper.label}
        </a>
      )}
    </div>
  );
}

function Stamp({ char, big, pop }: { char?: string; big?: boolean; pop?: boolean }) {
  const cls = ["stamp", big ? "big" : "", char ? "on" : "", pop && char ? "pop" : ""].filter(Boolean).join(" ");
  return <span className={cls}>{char ?? ""}</span>;
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="5" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="2.5" x2="12" y2="5" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="var(--paper)" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}
