// PreToolUse (Bash): 公式サイトへの取得は1回だけ。取得済みの URL への curl/wget を拒む。
import { readFileSync, existsSync } from "node:fs";

const HOSTS = ["city.tottori.lg.jp", "pref.tottori.lg.jp", "odp-pref-tottori", "nlftp.mlit.go.jp"];
const input = JSON.parse(readFileSync(0, "utf8"));
const cmd = String(input.tool_input?.command ?? "");
if (!/\b(curl|wget|Invoke-WebRequest|iwr)\b/.test(cmd)) process.exit(0);

const urls = cmd.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
const targets = urls.filter((u) => HOSTS.some((h) => u.includes(h)));
if (targets.length === 0) process.exit(0);

const fetched = ["data/SOURCES.md", "data/raw/fetch.log"]
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const dup = targets.filter((u) => fetched.includes(u));
if (dup.length === 0) process.exit(0);
console.error(`fetch-once: 取得済みの URL です。再取得しない。\n${dup.join("\n")}\n必要なら data/raw/ の既存ファイルを使う。`);
process.exit(2);
