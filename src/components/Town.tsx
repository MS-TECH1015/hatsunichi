"use client";
// 町を歩く画面。描画は TownScene、ここはタイトル・HUD・会話・依頼の選択・判子・詳細の UI。
// 画面に出す文字は一言ずつにし、理由・出典・付箋・窓口は「くわしく」の中に置く
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CALCS, defaults, type Calc } from "@/lib/calcs";
import { clockText, markFind, rideFind, spotFind, targetAt, unsourcedNumbers, type Fact, type Find, type Mark, type Note, type Option, type Place, type Spot, type Target, type World } from "@/lib/world";
import { withBase } from "@/lib/base";
import type { TownScene } from "./town/TownScene";
import { play, setMuted } from "./town/sfx";

type Props = { world: World };
/** own は自分で書いた一行。選んだ案と違い付箋が無いので、確かめる問いだけを出す */
/** fact は学生が選んだ根拠の数字。案は数字と出典を付けて窓口へ持っていく */
type Answer = { spot: Spot; option: string; label: string; note: Note; own?: boolean; fact: Fact; calc?: string };
type Voice = { name: string; role: string; view: string; heard: boolean };
type Stage = "hint" | "ask" | "write" | "basis" | "calc" | "result";
type Panel =
  | { type: "talk"; speaker: string; role?: string; lines: string[]; i: number }
  | { type: "spot"; spot: Spot; stage: Stage; detail?: boolean; draft?: string; pending?: { option: Option; own: boolean; fact?: Fact } }
  | { type: "bus"; from: Place }
  | { type: "ride"; to: Place; minutes: number }
  | { type: "end" }
  | { type: "book" }
  | null;

const MUTE_KEY = "hatsunichi-muted";
const SENT_KEY = "hatsunichi-sent";

/** 市に出した記録。本人のブラウザにだけ残す。返事が来たら貼り、就活で見せられる一覧にする */
type Sent = { at: string; titles: string[]; reply: string };

function loadSent(): Sent[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => typeof x?.at === "string" && Array.isArray(x.titles))
      .map((x) => ({ at: x.at, titles: x.titles.map(String), reply: String(x.reply ?? "") }));
  } catch {
    return [];
  }
}

function saveSent(list: Sent[]) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(list));
  } catch {
    // 保存できない環境では、この回だけの記録になる
  }
}

const BOOK_KEY = "hatsunichi-book";

/** 手帳は回をまたいで残す。本人のブラウザにだけ置く */
function loadBook(): Find[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(BOOK_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => typeof x?.id === "string" && typeof x.text === "string" && typeof x.source === "string")
      .map((x) => ({ id: x.id, text: x.text, source: x.source, spot: typeof x.spot === "string" ? x.spot : undefined, place: typeof x.place === "string" ? x.place : undefined }));
  } catch {
    return [];
  }
}

function saveBook(list: Find[]) {
  try {
    localStorage.setItem(BOOK_KEY, JSON.stringify(list));
  } catch {
    // 保存できない環境では、この回だけの手帳になる
  }
}

/** 市政提案は 2 週間をめどに回答すると書いている。world.submit.reply の出典と同じ */
function replyBy(at: string): string {
  const d = new Date(at);
  d.setDate(d.getDate() + 14);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
const LINE_MAX = 60; // 自分の一行の長さの上限。窓口に一文で伝わる長さ

export function Town({ world }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TownScene | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [minutes, setMinutes] = useState(world.meta.clock.start_hour * 60);
  const [target, setTarget] = useState<Target | null>(null);
  const [mark, setMark] = useState<Mark | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [talked, setTalked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [muted, setMute] = useState(false);
  const [stampedId, setStampedId] = useState<string | null>(null);
  const [bigMap, setBigMap] = useState(false);
  /** 歩いて見つけたこと。案を出さずに歩くだけの人にも、終業で残るものにする */
  const [finds, setFinds] = useState<Find[]>([]);
  const [fresh, setFresh] = useState<Find | null>(null);
  /** 本人が手伝えること。案の文は AI でも書けるが、手伝いに行くのは本人なので 1 枚の頭に載せる */
  const [help, setHelp] = useState("");
  const [sent, setSent] = useState<Sent[]>([]);
  const [showSent, setShowSent] = useState(false);
  const [marked, setMarked] = useState(false);
  /** 回をまたいで残す手帳。finds はこの回に見つけたもので、前の回に見たものは知らせずに数えるだけ */
  const [book, setBook] = useState<Find[]>([]);
  const bookRef = useRef<Find[]>([]);
  const seen = useRef(new Set<string>());
  const jot = useCallback((f: Find) => {
    if (seen.current.has(f.id)) return;
    seen.current.add(f.id);
    setFinds((prev) => [...prev, f]);
    if (bookRef.current.some((x) => x.id === f.id)) return;
    bookRef.current = [...bookRef.current, f];
    setBook(bookRef.current);
    saveBook(bookRef.current);
    setFresh(f);
    play("select", 0.4);
  }, []);
  /** 町を歩くだけ。白兎の初日も時計の終業も無い */
  const [walk, setWalk] = useState(false);
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
        setPlaceName(s.place);
        setMark(s.mark);
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
    if (!started || panel || walk) return;
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

  function stroll() {
    if (!ready || started) return;
    play("start");
    setWalk(true);
    setStarted(true);
    sceneRef.current?.play();
    sceneRef.current?.setPaused(false);
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

  // 依頼の場所の近くに来たら、その場所の数字を手帳に残す。話しかけなくても残る
  useEffect(() => {
    if (started && target?.type === "spot") jot(spotFind(target.spot, world.sources));
  }, [started, target, jot, world.sources]);

  // 町丁の印の近くを通ったら、その町丁の人口と近い病院・小学校までの距離を手帳に残す
  useEffect(() => {
    if (started && mark) jot(markFind(mark, world.sources));
  }, [started, mark, jot, world.sources]);

  // 手帳に入った印は、町の札を薄くし地図から消す
  useEffect(() => {
    if (ready) sceneRef.current?.setFound(book.filter((f) => f.id.startsWith("mark:")).map((f) => f.id.slice(5)));
  }, [ready, book]);

  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(null), 3200);
    return () => window.clearTimeout(t);
  }, [fresh]);

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
    jot(rideFind(from, to));
  }

  /** 案を決めたら、次は根拠の数字を選ぶ。数字の無い案は窓口で使えないので、ここを通らないと判子は押されない */
  function choose(spot: Spot, o: Option, own = false) {
    play("select");
    setPanel({ type: "spot", spot, stage: "basis", pending: { option: o, own } });
  }

  /** 根拠を選んだら、その町の計算で案の大きさを見る。計算の無い場所はそのまま決まる */
  function settle(spot: Spot, fact: Fact) {
    if (panel?.type !== "spot" || !panel.pending) return;
    if (CALCS[spot.id]) {
      play("select");
      setPanel({ ...panel, stage: "calc", pending: { ...panel.pending, fact } });
      return;
    }
    finish(spot, fact);
  }

  function finish(spot: Spot, fact: Fact, calc?: string) {
    if (panel?.type !== "spot" || !panel.pending) return;
    const { option: o, own } = panel.pending;
    play("choose");
    setAnswers((prev) => [...prev.filter((x) => x.spot.id !== spot.id), { spot, option: o.text, label: o.label, note: o.note, own, fact, calc }]);
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
    setSent(loadSent());
    bookRef.current = loadBook();
    setBook(bookRef.current);
  }, []);

  function openBook() {
    if (panel) return;
    sceneRef.current?.setPaused(true);
    play("open");
    setPanel({ type: "book" });
  }

  function markSent() {
    const at = new Date().toLocaleDateString("sv-SE");
    const next = [...sent, { at, titles: answers.map((a) => `${a.spot.title}: ${a.label}`), reply: "" }];
    setSent(next);
    saveSent(next);
    setMarked(true);
    play("stamp");
  }

  function setReply(i: number, reply: string) {
    const next = sent.map((s, j) => (j === i ? { ...s, reply } : s));
    setSent(next);
    saveSent(next);
  }

  function copySent() {
    const body = sent.map((s) => [`- ${s.at} ${world.submit.name}へ出した: ${s.titles.join(" / ")}`, s.reply.trim() && `  返事: ${s.reply.trim()}`].filter(Boolean).join("\n"));
    void navigator.clipboard.writeText(`はつにち 出した記録\n\n${body.join("\n")}\n`).then(() => setCopied(true));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!started) {
        if (showSent) return;
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
  /** 同じ町の住民の立場。話していない人は役割だけ見せて、聞きに行く手がかりにする */
  const voicesOf = (spot: Spot): Voice[] =>
    world.npcs.filter((n) => n.place === spot.place && n.view).map((n) => ({ name: n.name, role: n.role, view: n.view ?? "", heard: talked.includes(n.id) }));

  /** 案を出した場所の数字は案の中に載っているので、手帳の一覧からは外す */
  const extraFinds = finds.filter((f) => !answers.some((a) => a.spot.id === f.spot));

  function copyAnswers() {
    const body = answers.map((a) => sheetOf(a, world)).join("\n\n");
    const found = extraFinds.map((f) => `- ${f.text} 出典: ${f.source}`).join("\n");
    const text = ["はつにち 初日の記録", help.trim() && `自分が手伝えること: ${help.trim()}`, body, found && `■ 見つけたこと\n${found}`].filter(Boolean).join("\n\n");
    void navigator.clipboard.writeText(`${text}\n`).then(() => setCopied(true));
  }
  const day = Math.min(Math.max((minutes - start_hour * 60) / ((end_hour - start_hour) * 60), 0), 1);
  const people = talked.filter((id) => world.npcs.some((n) => n.id === id)).length;

  return (
    <div className="town">
      <canvas ref={canvasRef} className="town-canvas" />

      {!started && (
        <div className="title">
          <h1 className="logo">はつにち</h1>
          <p className="tagline">鳥取市を歩いて、町の困りごとを見つける。</p>
          <button className="btn-game big" disabled={!ready} onClick={begin}>
            {ready ? "はじめる" : "よみこみ中…"}
          </button>
          <button className="btn-game ghost" disabled={!ready} onClick={stroll}>
            町を歩くだけ
          </button>
          <p className="title-keys">
            <kbd>←↑↓→</kbd> 歩く　<kbd>Shift</kbd> 走る　<kbd>Space</kbd> 話す
          </p>
          {sent.length > 0 && (
            <button className="btn-game small ghost" onClick={() => setShowSent(true)}>
              出した記録 {sent.length}
            </button>
          )}
          <p className="title-note">
            人・店・相談は架空。地名と地形は実在。数字は出典つき
            <br />
            地形: 国土地理院 標高タイルを加工 ・ 市の境: 国土数値情報（行政区域）を加工
            <br />
            町の「?」: 政府統計の総合窓口(e-Stat)「国勢調査」（総務省）と国土数値情報（医療機関・学校）を加工
          </p>
        </div>
      )}

      {!started && showSent && (
        <div className="end">
          <div className="end-card sent-card">
            <h2>出した記録</h2>
            <ul className="sent-list">
              {sent.map((s, i) => (
                <li key={`${s.at}-${i}`}>
                  <b>{s.at} に出した</b>
                  <span>{s.titles.join(" / ")}</span>
                  <small>返事のめど {replyBy(s.at)}</small>
                  <textarea value={s.reply} onChange={(e) => setReply(i, e.target.value)} placeholder="返ってきた返事を貼る" rows={2} maxLength={2000} />
                </li>
              ))}
            </ul>
            <div className="end-actions">
              <button className="btn-game ghost" onClick={copySent}>
                {copied ? "写しました" : "記録を書き写す"}
              </button>
              <button className="btn-game" onClick={() => setShowSent(false)}>
                とじる
              </button>
            </div>
          </div>
        </div>
      )}

      {started && (
        <div className="place-banner" key={placeName ?? ""} hidden={!placeName || panel !== null}>
          {placeName}
        </div>
      )}

      {started && (
        <div className="hud">
          {!walk && (
            <div className="hud-clock">
              <SunIcon />
              <span>{clockText(minutes)}</span>
              <span className="hud-day" aria-hidden>
                <span style={{ width: `${day * 100}%` }} />
              </span>
            </div>
          )}
          <button className="hud-finds" onClick={openBook} aria-label={`手帳 これまでに ${book.length}`}>
            手帳 {book.length}
          </button>
          {!walk && (
            <div className="hud-stamps" aria-label={`案 ${answers.length}/3`}>
              {[0, 1, 2].map((i) => (
                <Stamp key={i} char={answers[i]?.spot.stamp} pop={answers[i]?.spot.id === stampedId} />
              ))}
            </div>
          )}
          <button className={walk ? "hud-sound push" : "hud-sound"} onClick={toggleMute} aria-label={muted ? "音を出す" : "音を消す"}>
            <SoundIcon muted={muted} />
          </button>
        </div>
      )}

      {started && fresh && panel?.type !== "end" && (
        <div className="find-toast" key={fresh.id}>
          <small>手帳に書いた</small>
          {fresh.text}
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
          <small>国土地理院・国土数値情報・e-Stat を加工</small>
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
          voices={voicesOf(panel.spot)}
          draft={panel.draft}
          guide={guide}
          world={world}
          onStage={(stage, draft) => setPanel({ ...panel, stage, draft })}
          onDetail={(detail) => {
            play(detail ? "open" : "talk");
            setPanel({ ...panel, detail });
          }}
          onChoose={choose}
          onSettle={settle}
          onCalc={(calc) => panel.pending?.fact && finish(panel.spot, panel.pending.fact, calc)}
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

      {panel?.type === "book" && <BookView book={book} world={world} onClose={close} />}

      {panel?.type === "end" && (
        <div className="end">
          <div className="end-card">
            <h2>初日、おつかれさま</h2>
            <div className="end-stamps">
              {[0, 1, 2].map((i) => (
                <Stamp key={i} char={answers[i]?.spot.stamp} big />
              ))}
            </div>
            <p className="end-line">
              {guide}「{answers.length === 0 ? "明日は一つ、出してみよう" : "出したら、市から返事が来るよ"}」
            </p>
            <ul className="end-list">
              {answers.map((a) => (
                <li key={a.spot.id}>
                  <Stamp char={a.spot.stamp} />
                  <span className="end-label">
                    {a.label}
                    <small>{a.spot.window.name}</small>
                  </span>
                  <a href={a.spot.window.url} target="_blank" rel="noreferrer">
                    ひらく
                  </a>
                </li>
              ))}
            </ul>
            {extraFinds.length > 0 && (
              <div className="end-finds">
                <h3>見つけたこと {extraFinds.length}</h3>
                <ul>
                  {extraFinds.map((f) => (
                    <li key={f.id}>
                      {f.text}
                      {f.spot && <em>案はまだ</em>}
                      <small>{f.source}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {answers.length > 0 && (
              <p className="end-meta">
                <a href={world.submit.url} target="_blank" rel="noreferrer">
                  {world.submit.name}
                </a>{" "}
                に出すと、市から返事が来る。{world.submit.reply}
              </p>
            )}
            <p className="end-meta">
              {clockText(minutes)} ・ 話した人 {people}
            </p>
            {answers.length > 0 && (
              <label className="end-help">
                自分が手伝えること
                <input value={help} onChange={(e) => setHelp(e.target.value)} maxLength={60} placeholder="例: 月に一度、土曜の午前なら行ける" />
              </label>
            )}
            <div className="end-actions">
              {(answers.length > 0 || finds.length > 0) && (
                <button className="btn-game ghost" onClick={copyAnswers}>
                  {copied ? "写しました" : "書き写す"}
                </button>
              )}
              {answers.length > 0 && (
                <button className="btn-game ghost" onClick={markSent} disabled={marked}>
                  {marked ? "記録した" : "出したら記録"}
                </button>
              )}
              <button className="btn-game" onClick={() => location.reload()}>
                もう一度
              </button>
            </div>
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
      if (e.target instanceof HTMLInputElement) return;
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
  voices: Voice[];
  draft?: string;
  guide: string;
  world: World;
  onStage: (s: Stage, draft?: string) => void;
  onDetail: (open: boolean) => void;
  onChoose: (s: Spot, o: Option, own?: boolean) => void;
  onSettle: (s: Spot, f: Fact) => void;
  onCalc: (calc?: string) => void;
  onClose: () => void;
};

/** 窓口に持っていく1枚。根拠の数字と出典、まだ確かめていないことを付ける。
 * 町の住民は架空なので、その声は載せない */
function sheetOf(a: Answer, world: World): string {
  const src = world.sources[a.fact.source];
  const { submit } = world;
  return [
    `■ ${a.spot.title}`,
    `案: ${a.option}`,
    `根拠: ${a.fact.text}`,
    `出典: ${src.name} ${src.url}`,
    a.calc && `計算（前提は推定）: ${a.calc}`,
    `まだ確かめていないこと: ${a.spot.checks.join(" / ")}`,
    `出す先: ${submit.name} ${submit.url}`,
    a.spot.window.url !== submit.url && `担当の窓口: ${a.spot.window.name} ${a.spot.window.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 調べる → 頼まれる → 町の人の声を見て、案を選ぶか自分で書く → 判子と問い。理由と出典は「くわしく」に。
 * 3つの案は正解ではなく方向の違う出発点。考えるのは遊んでいる学生で、ゲームは材料と問いだけを渡す */
function SpotView({ spot, stage, detail, answer, voices, draft, guide, world, onStage, onDetail, onChoose, onSettle, onCalc, onClose }: SpotViewProps) {
  useEffect(() => {
    if (detail || (stage !== "ask" && stage !== "basis")) return;
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (stage === "basis") {
        const f = spot.facts[i];
        if (f) onSettle(spot, f);
        return;
      }
      if (e.key === String(spot.quest.options.length + 1)) onStage("write");
      const o = spot.quest.options[i];
      if (o) onChoose(spot, o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, detail, spot, onChoose, onSettle, onStage]);

  if (detail) return <Detail spot={spot} answer={answer} voices={voices} world={world} onClose={() => onDetail(false)} />;

  if (stage === "write")
    return (
      <WriteView
        draft={draft}
        prompt={spot.quest.write}
        facts={spot.facts}
        guide={guide}
        onDone={(line) => onChoose(spot, { text: line, label: line, note: { good: "", gap: "", question: spot.checks[0] } }, true)}
        onBack={() => onStage("ask")}
      />
    );

  if (stage === "hint") return <Dialog text={spot.hint} onNext={() => onStage("ask")} />;

  if (stage === "calc" && CALCS[spot.id]) return <CalcView calc={CALCS[spot.id]} spot={spot} world={world} guide={guide} onDone={onCalc} onBack={() => onStage("basis")} />;

  if (stage === "basis")
    return (
      <>
        <div className="choices">
          {spot.facts.map((f, i) => (
            <button key={f.text} className="choice fact" onClick={() => onSettle(spot, f)} onMouseEnter={() => play("select", 0.2)}>
              <kbd>{i + 1}</kbd>
              {f.text}
            </button>
          ))}
          <button className="choice why" onClick={() => onStage("ask")}>
            もどる
          </button>
        </div>
        <Dialog speaker={guide} text="どの数字を根拠にする？" />
      </>
    );

  if (stage === "ask")
    return (
      <>
        <div className="choices">
          {voices.length > 0 && (
            <ul className="voices" aria-label="町の人の声">
              {voices.map((v) => (
                <li key={v.name} className={v.heard ? undefined : "unheard"}>
                  <b>{v.heard ? v.name : "？"}</b>
                  {v.heard ? v.view : `${v.role}に、まだ聞いてない`}
                </li>
              ))}
            </ul>
          )}
          {spot.quest.options.map((o, i) => (
            <button key={o.label} className="choice" onClick={() => onChoose(spot, o)} onMouseEnter={() => play("select", 0.2)}>
              <kbd>{i + 1}</kbd>
              {o.label}
            </button>
          ))}
          <button className="choice own" onClick={() => onStage("write")} onMouseEnter={() => play("select", 0.2)}>
            <kbd>{spot.quest.options.length + 1}</kbd>
            自分で書く
          </button>
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
              onStage("write", answer.option);
            }}
          >
            書き直す
          </button>
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

/** 自分の一行を書く。Enter で出す。変換中の Enter は確定に使われるので出さない */
function WriteView({ draft, prompt, facts, guide, onDone, onBack }: { draft?: string; prompt: string; facts: Fact[]; guide: string; onDone: (line: string) => void; onBack: () => void }) {
  const [text, setText] = useState(draft ?? "");
  const line = text.trim();
  const loose = unsourcedNumbers(line, facts);
  const submit = () => {
    if (line) onDone(line);
  };

  return (
    <>
      <div className="write">
        <input
          autoFocus
          maxLength={LINE_MAX}
          value={text}
          placeholder="だれが、いつ、なにをするか"
          aria-label="自分の案"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onBack();
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
        />
        <small>
          {line.length}/{LINE_MAX}
        </small>
        <button className="btn-game small" disabled={!line} onClick={submit}>
          これで出す
        </button>
        <button className="btn-game small ghost" onClick={onBack}>
          もどる
        </button>
        {loose.length > 0 && <p className="loose">「{loose.join("」「")}」は調べた数字に無い。自分で決めた数なら、そのままで</p>}
      </div>
      <Dialog speaker={guide} text={prompt} />
    </>
  );
}

/** くわしく。なんでこうなってるか、出典、町の人の声、付箋、確かめる問い、窓口 */
function Detail({ spot, answer, voices, world, onClose }: { spot: Spot; answer?: Answer; voices: Voice[]; world: World; onClose: () => void }) {
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

      {voices.some((v) => v.heard) && (
        <>
          <h3>町の人の声</h3>
          <ul className="facts">
            {voices
              .filter((v) => v.heard)
              .map((v) => (
                <li key={v.name}>
                  <b>{v.name}</b> {v.view}
                </li>
              ))}
          </ul>
        </>
      )}

      {answer?.own && (
        <>
          <h3>あなたの一行</h3>
          <p className="chosen">{answer.option}</p>
        </>
      )}

      {answer && (
        <>
          <h3>根拠にした数字</h3>
          <p className="chosen">{answer.fact.text}</p>
        </>
      )}

      {answer && !answer.own && (
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
          <p className="muted small">付箋は前もって書いたもの。正解ではない</p>
        </>
      )}

      {answer && spot.checks.length > 0 && (
        <>
          <h3>出す前に</h3>
          <ul className="facts">
            {spot.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}

      <h3>届け先</h3>
      <p>
        案を出すなら{" "}
        <a href={world.submit.url} target="_blank" rel="noreferrer">
          {world.submit.name}
        </a>
        。<span className="muted small">{world.submit.reply}</span>
      </p>
      {spot.window.url !== world.submit.url && (
        <p>
          担当は{" "}
          <a href={spot.window.url} target="_blank" rel="noreferrer">
            {spot.window.name}
          </a>{" "}
          <span className="muted small">{spot.window.checked} 確認</span>
        </p>
      )}
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

/** 手帳。町ごとに見つけた数と、これまでに見つけたこと。バスで移った距離は「移動」にまとめる */
function BookView({ book, world, onClose }: { book: Find[]; world: World; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = (place: string) => world.spots.filter((s) => s.place === place).length + world.marks.filter((m) => m.place === place).length;
  const moves = book.filter((f) => !f.place);
  return (
    <div className="end">
      <div className="end-card sent-card">
        <h2>手帳</h2>
        {world.places.map((p) => {
          const got = book.filter((f) => f.place === p.id);
          return (
            <section key={p.id} className="book-town">
              <h3>
                {p.name}
                <span>
                  {got.length} / {total(p.id)}
                </span>
              </h3>
              <ul>
                {got.map((f) => (
                  <li key={f.id}>
                    {f.text}
                    <small>{f.source}</small>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {moves.length > 0 && (
          <section className="book-town">
            <h3>
              移動<span>{moves.length}</span>
            </h3>
            <ul>
              {moves.map((f) => (
                <li key={f.id}>
                  {f.text}
                  <small>{f.source}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="end-actions">
          <button className="btn-game" onClick={onClose}>
            とじる
          </button>
        </div>
      </div>
    </div>
  );
}

/** 案の大きさを町の数字と比べる計算。動かす前提には「推定」と付け、結果は前提の値ごと 1 枚に載る */
function CalcView({ calc, spot, world, guide, onDone, onBack }: { calc: Calc; spot: Spot; world: World; guide: string; onDone: (calc?: string) => void; onBack: () => void }) {
  const [k, setK] = useState(() => defaults(calc));
  const text = calc.say(k);
  const used = [...new Set(calc.bases.map((b) => b.fact))].map((i) => spot.facts[i]);
  return (
    <>
      <div className="choices">
        <div className="calc-box">
          <p className="calc-ask">{calc.ask}</p>
          {calc.knobs.map((x) => (
            <label key={x.id} className="calc-knob">
              <span>
                {x.label}
                <em>推定</em>
              </span>
              <input type="range" min={x.min} max={x.max} step={x.step} value={k[x.id]} onChange={(e) => setK({ ...k, [x.id]: Number(e.target.value) })} />
              <b>
                {k[x.id]} {x.unit}
              </b>
            </label>
          ))}
          <p className="calc-out">{text}</p>
          <small className="calc-src">根拠: {used.map((f) => world.sources[f.source]?.name ?? f.source).join(" / ")}</small>
        </div>
        <button className="choice wide" onClick={() => onDone(text)} onMouseEnter={() => play("select", 0.2)}>
          この計算も1枚に載せて決める
        </button>
        <button className="choice why" onClick={() => onDone()}>
          計算は載せずに決める
        </button>
        <button className="choice why" onClick={onBack}>
          もどる
        </button>
      </div>
      <Dialog speaker={guide} text="前提を動かして、案がどれくらい届くか見てみよう" />
    </>
  );
}
