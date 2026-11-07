// 自分の家の近く。町名を選ぶと、近い空き家・使われていない市の施設・バス停を出す。
// 町名はこのブラウザの localStorage にだけ置き、どこにも送らない。
import { useEffect, useState } from "react";
import { withBase } from "@/lib/base";
import { km, nearMe, WALK_M_PER_MIN, type Near, type NearData } from "@/lib/near";
import type { Place, Placed, Vec2 } from "@/lib/world";

const ME_KEY = "hatsunichi.me";
export type Me = { chome: string; at: Vec2 };

export function loadMe(): Me | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
    if (!v || typeof v !== "object") return null;
    const { chome, at } = v as Me;
    if (typeof chome !== "string" || !Array.isArray(at) || at.length !== 2) return null;
    return { chome, at: [Number(at[0]), Number(at[1])] };
  } catch {
    return null;
  }
}

function saveMe(me: Me | null) {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    // 保存できなくても、この画面の中では使える
  }
}

const far = (n: Near) => (n.m < 100 ? "同じ町の中" : `まっすぐ ${km(n.m)}、歩いて約 ${n.minutes} 分`);

export function NearMePanel({ me, placed, onMe, onBegin }: { me: Me | null; placed: Placed; onMe: (me: Me | null) => void; onBegin: (p: Place) => void }) {
  const [data, setData] = useState<NearData | null>(null);
  const [text, setText] = useState(me?.chome ?? "");
  useEffect(() => {
    fetch(withBase("/city/near.json"))
      .then((r) => r.json())
      .then((d: NearData) => setData(d))
      .catch(() => setData(null));
  }, []);

  function pick(v: string) {
    setText(v);
    const hit = data?.chome.find((c) => c[0] === v);
    if (!hit) return;
    const next: Me = { chome: v, at: [hit[1], hit[2]] };
    saveMe(next);
    onMe(next);
  }

  function clear() {
    setText("");
    saveMe(null);
    onMe(null);
  }

  const found = data && me ? nearMe(me.chome, data, placed) : null;
  return (
    <div className="near-me">
      <h3>自分の家の近く</h3>
      <input className="near-input" list="near-chome" placeholder="町名を入れる 例: 栄町" value={text} onChange={(e) => pick(e.target.value)} aria-label="住んでいる町名" />
      <datalist id="near-chome">
        {data?.chome.map((c) => <option key={c[0]} value={c[0]} />)}
      </datalist>
      <p className="home-note">
        町名はこのブラウザの中でだけ使い、どこにも送らない
        {me && (
          <button className="link-more" onClick={clear}>
            消す
          </button>
        )}
      </p>
      {found && (
        <>
          <ul className="home-facts">
            {found.akiya.map((a) => (
              <li key={a.name + a.m} className="near-akiya">
                {a.name}　{far(a)}
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer">
                    物件のページ
                  </a>
                )}
              </li>
            ))}
            {found.facility && (
              <li>
                使われていない市の施設 {found.facility.name}　{far(found.facility)}
              </li>
            )}
            {found.stop && (
              <li>
                バス停 {found.stop.name}　{far(found.stop)}。平日に止まる便は上り下りあわせて {found.stop.perDay} 本
              </li>
            )}
          </ul>
          <p className="past-src">
            空き家の位置は町名の代表点で、家の位置ではない。距離は町名の代表点からまっすぐ測ったもの。歩く分数は 1 分 {WALK_M_PER_MIN} m の目安。出典: 鳥取市 空き家情報バンク、国土交通省 位置参照情報、日本交通・日ノ丸自動車の GTFS
          </p>
          <button className="btn-game" onClick={() => onBegin(found.place)}>
            近くの町 {found.place.name}から歩く
          </button>
        </>
      )}
    </div>
  );
}
