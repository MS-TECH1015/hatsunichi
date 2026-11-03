// Stop: docs/devlog.md に1行。前の行と差分が無ければ書かない。
// 形式: 日時 | コミット | 変更ファイル数 +行 -行 | test 通過/総数
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";

const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };
const commit = sh("git rev-parse --short HEAD") || "-";
const stat = sh("git diff --shortstat HEAD");
const files = (stat.match(/(\d+) files? changed/) ?? [, "0"])[1];
const ins = (stat.match(/(\d+) insertions?/) ?? [, "0"])[1];
const del = (stat.match(/(\d+) deletions?/) ?? [, "0"])[1];

let test = "未実行";
if (existsSync(".cache/vitest.json")) {
  const r = JSON.parse(readFileSync(".cache/vitest.json", "utf8"));
  test = `${r.numPassedTests}/${r.numTotalTests}`;
}
const body = `${commit} | ${files}ファイル +${ins} -${del} | test ${test}`;
const log = existsSync("docs/devlog.md") ? readFileSync("docs/devlog.md", "utf8") : "";
const last = log.trim().split("\n").at(-1) ?? "";
if (last.includes(body)) process.exit(0);

const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 16);
appendFileSync("docs/devlog.md", `${now} | ${body}\n`);
