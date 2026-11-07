/** 作られた 1 枚の合計。公開版の中継（relay/worker.ts の /made）に数だけを送る。
 * 1 枚の中身・町・書いた一行は送らない。中継が無い手元版では何もしない */
const BASE = process.env.NEXT_PUBLIC_REVIEW_URL;
const MADE_URL = BASE && new URL("made", BASE).toString();

export async function madeTotal(): Promise<number | null> {
  if (!MADE_URL) return null;
  try {
    const res = await fetch(MADE_URL);
    if (!res.ok) return null;
    return ((await res.json()) as { total: number }).total;
  } catch {
    return null;
  }
}

export function countMade(): void {
  if (!MADE_URL) return;
  void fetch(MADE_URL, { method: "POST", keepalive: true }).catch(() => {});
}
