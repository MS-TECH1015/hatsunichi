// PreToolUse (Write|Edit): data/ 配下の JSON に、source_id の無い数値を書かせない。
// 判定本体は scripts/check-sources.mjs と同じ関数。拒むときは exit 2 で理由を stderr に出す。
import { readFileSync } from "node:fs";
import { findUnsourcedNumbers } from "../../scripts/check-sources.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = String(input.tool_input?.file_path ?? "").replaceAll("\\", "/");
if (!/\/data\/[^/]+\.json$/.test(file)) process.exit(0);

let next;
if (input.tool_name === "Write") {
  next = input.tool_input.content;
} else {
  const current = readFileSync(file, "utf8");
  const { old_string, new_string, replace_all } = input.tool_input;
  next = replace_all ? current.split(old_string).join(new_string) : current.replace(old_string, new_string);
}

let json;
try {
  json = JSON.parse(next);
} catch (e) {
  console.error(`require-source: ${file} は JSON として読めない: ${e.message}`);
  process.exit(2);
}
const problems = findUnsourcedNumbers(json);
if (problems.length === 0) process.exit(0);
console.error(`require-source: source_id の無い数値が ${problems.length} 件。先頭5件:\n` + problems.slice(0, 5).join("\n"));
process.exit(2);
