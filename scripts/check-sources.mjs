// data/town.json の数値がすべて出典に戻れるかを検査する。
// 規則: 数値を持つオブジェクトは、自分か祖先に source_id を持ち、その id が meta.sources に存在する。
// 例外: meta（出典表そのもの）と assumptions（「仮定」の札で表示する値）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_KEYS = new Set(["lat", "lon", "centroid", "stop_sequence", "persons"]);

export function findUnsourcedNumbers(json) {
  const known = new Set((json.meta?.sources ?? []).map((s) => s.source_id));
  const problems = [];
  walk(json, "", null);
  return problems;

  function walk(node, path, inherited) {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, inherited));
      return;
    }
    if (node === null || typeof node !== "object") return;
    if (path === ".meta" || path === ".assumptions") return;

    const own = node.source_id ?? inherited;
    if (node.source_id !== undefined && !known.has(node.source_id)) {
      problems.push(`${path}: source_id "${node.source_id}" は meta.sources に無い`);
    }
    for (const [k, v] of Object.entries(node)) {
      const p = `${path}.${k}`;
      if (typeof v === "number" && !SKIP_KEYS.has(k) && own === undefined) {
        problems.push(`${p} = ${v}`);
        continue;
      }
      walk(v, p, own);
    }
  }
}

const runAsMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (runAsMain) {
  const file = process.argv[2] ?? "data/town.json";
  const problems = findUnsourcedNumbers(JSON.parse(readFileSync(file, "utf8")));
  if (problems.length) {
    console.error(`${file}: source_id の無い数値 ${problems.length} 件\n` + problems.slice(0, 20).join("\n"));
    process.exit(1);
  }
  console.log(`${file}: すべての数値に出典あり`);
}
