// 静的書き出しを gh-pages ブランチへ push して GitHub Pages に出す。
// Actions の workflow を push できる権限が無いときの道。使い方: npm run deploy
import { execSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";

const run = (cmd, cwd = ".") => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "/hatsunichi" } });
const remote = execSync("git remote get-url origin").toString().trim();

run("npx next build");
writeFileSync("out/.nojekyll", "");
rmSync("out/.git", { recursive: true, force: true });
run("git init -q -b gh-pages", "out");
run("git add -A", "out");
run('git -c user.name="MS-TECH1015" -c user.email="MS-TECH1015@users.noreply.github.com" commit -q -m "pages build"', "out");
run(`git push -f ${remote} gh-pages`, "out");
rmSync("out/.git", { recursive: true, force: true });
console.log("配備した: https://ms-tech1015.github.io/hatsunichi/");
