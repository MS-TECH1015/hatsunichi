"use client";

import { useState } from "react";
import campusBus from "../../data/campus-bus.json";

/** 依頼「大学へ通える空き家」で、空き家情報バンクに登録中の物件ごとに、大学への乗り換えなしの便を見せ、
 * 市の空家対策係へ送る問い合わせ文を作る。文を送るのは本人で、アプリは何も送らない。
 * 物件について載せるのは、市が公開している町名・物件ページ・市の点から数えた最寄りの停留所だけ */
type Ride = { trips: number; fastest: number | null };
type Home = { id: string; town: string; url: string; stop: string; m: number; campus: Record<string, Ride> };
const { homes, date } = campusBus as { homes: Home[]; date: string };
const UNI = "鳥大";

const byRide = [...homes].sort((a, b) => b.campus[UNI].trips - a.campus[UNI].trips);

function inquiry(h: Home, windowName: string) {
  const ride = h.campus[UNI];
  return [
    `${windowName} ご担当者さま`,
    "",
    "鳥取大学の学生です。空き家情報バンクに登録されている物件について、お聞きしたいことがあり連絡しました。",
    "",
    `物件: ${h.town}（${h.url}）`,
    "",
    `この物件の近くの「${h.stop}」から、鳥取大学のバス停「鳥大」へ乗り換えなしの便が平日 1 日 ${ride.trips} 本あり、通学に使えそうだと考えています。`,
    "家主の方に、学生への賃貸や、学生数人での共同の住まいとして貸すお考えがあるか、うかがうことはできますでしょうか。",
    "あわせて、見学や申し込みの手順を教えていただけますと助かります。",
    "",
    "氏名:",
    "連絡先:",
  ].join("\n");
}

export function LodgingHomes({ windowName, windowUrl }: { windowName: string; windowUrl: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const home = homes.find((h) => h.id === open);
  return (
    <>
      <h3>通える物件</h3>
      <ul className="lodging-homes">
        {byRide.map((h) => {
          const ride = h.campus[UNI];
          return (
            <li key={h.id} className={ride.trips > 0 ? "ok" : undefined}>
              <b>{h.town}</b>
              <span>
                {h.stop}まで {h.m} m。
                {ride.trips > 0 ? `鳥大へ乗り換えなし、平日 1 日 ${ride.trips} 本、最短 ${ride.fastest} 分` : "鳥大へ乗り換えなしの便は無い"}
              </span>
              <span className="lodging-links">
                <a href={h.url} target="_blank" rel="noreferrer">
                  市の物件ページ
                </a>
                {ride.trips > 0 && (
                  <button
                    className="btn-game small ghost"
                    onClick={() => {
                      setOpen(h.id);
                      setCopied(false);
                    }}
                  >
                    問い合わせ文を作る
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        日本交通・日ノ丸自動車の時刻表（GTFS-JP）で、物件の点にいちばん近い停留所から数えた。{date} の時点。鉄道は入れていない。物件の点は市が公開した位置で、空き家の中を確かめたものではない
      </p>
      {home && (
        <div className="lodging-inquiry">
          <textarea readOnly value={inquiry(home, windowName)} rows={12} aria-label="問い合わせ文" />
          <p className="muted small">
            アプリは何も送らない。写して、氏名と連絡先を足し、
            <a href={windowUrl} target="_blank" rel="noreferrer">
              {windowName}
            </a>
            の連絡先へ自分で送る
          </p>
          <button className="btn-game small" onClick={() => void navigator.clipboard.writeText(inquiry(home, windowName)).then(() => setCopied(true))}>
            {copied ? "写しました" : "問い合わせ文を写す"}
          </button>
        </div>
      )}
    </>
  );
}
