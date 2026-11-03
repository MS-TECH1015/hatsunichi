// 効果音。素材は Kenney の Interface Sounds（CC0）。public/sounds/License-kenney-interface.txt
import { withBase } from "@/lib/base";

const FILES = {
  start: "maximize_006",
  talk: "click_002",
  open: "open_001",
  select: "select_001",
  choose: "confirmation_001",
  stamp: "drop_002",
  end: "confirmation_002",
} as const;

export type Sfx = keyof typeof FILES;

const cache = new Map<Sfx, HTMLAudioElement>();
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

export function play(name: Sfx, volume = 0.45) {
  if (muted || typeof Audio === "undefined") return;
  let base = cache.get(name);
  if (!base) {
    base = new Audio(withBase(`/sounds/${FILES[name]}.ogg`));
    cache.set(name, base);
  }
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = volume;
  // 再生できない環境（自動再生の制限や ogg 非対応）では黙って鳴らさない
  a.play().catch(() => {});
}
