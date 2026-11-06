// 最初の画面が押せるまでの転送量と時間を測る。使い方: node scripts/measure-load.mjs out 。playwright の場所はこの PC のもの
// 地元を探す画面の通しと、リンク用の絵を撮る。使い方: node data/raw/shot_home.mjs out <撮ったものの置き場>
import { chromium } from "file:///C:/Users/seiic/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const root = process.argv[2];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".bin": "application/octet-stream", ".wasm": "application/wasm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff2": "font/woff2" };
const base = "/hatsunichi";
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith(base)) p = p.slice(base.length);
  if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(join(root, p)); res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(4173);
const browser = await chromium.launch({ channel: "chrome" });
for (const net of [null, { down: 1.6e6 / 8, up: 750e3 / 8, lat: 150 }]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (net) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: net.lat, downloadThroughput: net.down, uploadThroughput: net.up });
  let bytes = 0; const big = [];
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; });
  page.on("response", async (r) => { const l = Number(r.headers()["content-length"] ?? 0); if (l > 200e3) big.push(r.url().split("/").pop() + " " + l); });
  const t0 = Date.now();
  await page.goto("http://localhost:4173/");
  await page.getByRole("button", { name: "歩かずに案を出す" }).waitFor({ timeout: 300000 });
  await page.waitForFunction(() => !document.querySelector(".title .btn-game.big")?.disabled, null, { timeout: 300000 });
  console.log(net ? "slow3g-ish" : "local", ((Date.now() - t0) / 1000).toFixed(1) + "s", (bytes / 1e6).toFixed(1) + "MB");
  if (!net) console.log(big.join("\n"));
  await ctx.close();
}
await browser.close(); srv.close();
