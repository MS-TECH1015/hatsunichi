// 配備先で、題の画面が押せるまでの転送量を測る。回線の圧縮後（encoded）と展開後（decoded）を分けて出す。
// 自分のサイトを 1 回だけ開く。使い方: node data/raw/load_live.mjs
import { chromium } from "file:///C:/Users/seiic/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const t0 = Date.now();
await page.goto("https://ms-tech1015.github.io/hatsunichi/");
await page.waitForFunction(() => !document.querySelector(".title .btn-game.big")?.disabled, null, { timeout: 300000 });
const ms = Date.now() - t0;
const r = await page.evaluate(() => {
  const g = new Map();
  let enc = 0, dec = 0;
  for (const e of performance.getEntriesByType("resource")) {
    enc += e.encodedBodySize; dec += e.decodedBodySize;
    const path = (e.name.split("/hatsunichi")[1] ?? e.name).replace(/\/[^/]*$/, "/*");
    const k = `${e.initiatorType} ${path}`;
    const v = g.get(k) ?? [0, 0, 0];
    v[0] += e.encodedBodySize; v[1] += e.decodedBodySize; v[2]++;
    g.set(k, v);
  }
  const nav = performance.getEntriesByType("navigation")[0];
  enc += nav?.encodedBodySize ?? 0; dec += nav?.decodedBodySize ?? 0;
  return { enc, dec, top: [...g].map(([k, v]) => [(v[0] / 1e6).toFixed(2), (v[1] / 1e6).toFixed(2), k, v[2]]).sort((a, b) => b[0] - a[0]).slice(0, 8) };
});
console.log(JSON.stringify({ ms, encMB: (r.enc / 1e6).toFixed(2), decMB: (r.dec / 1e6).toFixed(2), top: r.top }));
await browser.close();
