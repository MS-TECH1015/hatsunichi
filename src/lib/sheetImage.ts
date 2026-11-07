/** 作った 1 枚を、人に見せられる PNG にする。サーバーには送らず、端末の中で描く。
 * 載せるのは依頼の題・町・選んだ案・根拠の数字・出典の名前・担当の窓口だけ。書いた一行の「自分は」や手帳の中身は載せない */
export type ImageRow = { title: string; place: string; option: string; fact: string; source: string; window: string };

const W = 1080;
const PAD = 72;
const INK = "#2b2118";
const PAPER = "#fff8ec";
const ACCENT = "#f2b134";
const MUTED = "#7a6a58";

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > width && line) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

/** 描く前に高さを測るため、同じ手順を measure と draw の 2 回通す */
function layout(ctx: CanvasRenderingContext2D, rows: ImageRow[], font: string, url: string, draw: boolean): number {
  let y = PAD;
  const text = (s: string, size: number, color: string, weight = 400, gap = 1.45) => {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    for (const l of wrap(ctx, s, W - PAD * 2)) {
      y += size * gap;
      if (draw) ctx.fillText(l, PAD, y);
    }
  };
  text("はつにち", 40, MUTED, 800);
  text("鳥取市を歩いて見つけた困りごとと、案", 52, INK, 800);
  y += 24;
  for (const r of rows) {
    const top = y;
    y += 12;
    text(`${r.place}・${r.title}`, 36, INK, 800);
    text(`案: ${r.option}`, 34, INK, 600);
    text(`根拠: ${r.fact}`, 30, INK);
    text(`出典: ${r.source}`, 26, MUTED);
    text(`担当: ${r.window}`, 26, MUTED);
    y += 28;
    if (draw) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.strokeRect(PAD - 24, top - 8, W - PAD * 2 + 48, y - top);
    }
    y += 32;
  }
  text("数字はすべて公的な資料から。試作で、市・県とは関係ない", 26, MUTED);
  text(url, 26, MUTED);
  return y + PAD;
}

export async function sheetImage(rows: ImageRow[], url: string): Promise<Blob | null> {
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = W;
  canvas.height = layout(ctx, rows, font, url, false);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, 16);
  layout(ctx, rows, font, url, true);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** 共有できる端末なら共有の画面を開き、できなければ保存する */
export async function shareSheetImage(rows: ImageRow[], url: string): Promise<void> {
  const blob = await sheetImage(rows, url);
  if (!blob) return;
  const file = new File([blob], "hatsunichi.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "はつにち", text: "鳥取市で見つけた困りごとと、案", url }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hatsunichi.png";
  a.click();
  URL.revokeObjectURL(a.href);
}
