import type { PastIcon as Kind } from "@/lib/world";

// むかしの札の絵。資料の写真は権利の確かめが要るので、すべてここで描いた図形にする
const LINE = { stroke: "#2b2620", strokeWidth: 2.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const DRAW: Record<Kind, React.ReactNode> = {
  // 縄文の深鉢。口が開き、縄目の筋が入る
  doki: (
    <>
      <path d="M12 10 L36 10 L32 40 Q24 44 16 40 Z" fill="#c98b5a" {...LINE} />
      <path d="M15 18 Q24 21 33 18 M15 25 Q24 28 33 25 M16 32 Q24 35 32 32" fill="none" {...LINE} strokeWidth={1.8} />
    </>
  ),
  // 前方後円墳を上から見た形
  kofun: (
    <>
      <path d="M24 2 A14 14 0 0 1 33 26 L44 46 H4 L15 26 A14 14 0 0 1 24 2 Z" fill="#9fd3e8" stroke="#2b2620" strokeWidth={1.5} />
      <path d="M18 22 L30 22 L39 43 L9 43 Z" fill="#8fbf6a" {...LINE} />
      <circle cx="24" cy="16" r="11" fill="#8fbf6a" {...LINE} />
      <path d="M17 24 H31" fill="none" stroke="#8fbf6a" strokeWidth={4} />
    </>
  ),
  // 銅の鋺
  wan: (
    <>
      <path d="M8 20 L40 20 Q38 38 24 38 Q10 38 8 20 Z" fill="#7aa58e" {...LINE} />
      <path d="M18 38 L30 38 L32 42 L16 42 Z" fill="#7aa58e" {...LINE} />
    </>
  ),
  // 石垣の上の城
  shiro: (
    <>
      <path d="M8 42 L12 30 L36 30 L40 42 Z" fill="#b9b2a4" {...LINE} />
      <rect x="16" y="18" width="16" height="12" fill="#fffaf0" {...LINE} />
      <path d="M11 19 L24 9 L37 19 Z" fill="#4b5563" {...LINE} />
    </>
  ),
  // 国の役所。大きな屋根と柱
  yakusho: (
    <>
      <path d="M5 20 L24 9 L43 20 Z" fill="#a0522d" {...LINE} />
      <path d="M12 20 V38 M20 20 V38 M28 20 V38 M36 20 V38" fill="none" {...LINE} />
      <path d="M7 40 H41" fill="none" {...LINE} />
    </>
  ),
  // 字を書いた木の札
  fuda: (
    <>
      <path d="M17 6 H31 V40 H17 Z M17 12 L20 14 L17 16 M31 12 L28 14 L31 16" fill="#e2c48f" {...LINE} />
      <path d="M24 18 V22 M24 25 V29 M24 32 V36" fill="none" {...LINE} strokeWidth={2} />
    </>
  ),
  // 桟俵にのせた紙の雛
  hina: (
    <>
      <ellipse cx="24" cy="36" rx="17" ry="6" fill="#d9b76a" {...LINE} />
      <path d="M14 34 L19 18 L24 34 Z" fill="#e57373" {...LINE} />
      <path d="M24 34 L29 18 L34 34 Z" fill="#fffaf0" {...LINE} />
      <circle cx="19" cy="15" r="3" fill="#fffaf0" {...LINE} />
      <circle cx="29" cy="15" r="3" fill="#fffaf0" {...LINE} />
    </>
  ),
  // 砂丘の起伏と日
  sakyu: (
    <>
      <circle cx="35" cy="13" r="5" fill="#ffc23a" {...LINE} />
      <path d="M4 38 Q14 22 26 32 Q34 26 44 34 V42 H4 Z" fill="#e8cf96" {...LINE} />
    </>
  ),
};

export function PastIcon({ kind }: { kind: Kind }) {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      {DRAW[kind]}
    </svg>
  );
}
