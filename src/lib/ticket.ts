// tickets/路線名.md を読んで依頼票4行にする。front matter か 条件・依頼 の行が無ければ起動時に落とす。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Ticket = {
  file: string;
  route: string;
  deadline: string;
  requester: string;
  condition: string;
  request: string;
};

export function parseTicket(file: string, text: string): Ticket {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: front matter（--- で囲んだ route・deadline・requester）が無い`);
  const meta = Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf(":");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
  for (const key of ["route", "deadline", "requester"]) {
    if (!meta[key]) throw new Error(`${file}: front matter に ${key} が無い`);
  }
  const body = m[2];
  const condition = body.match(/^条件:\s*(.+)$/m)?.[1]?.trim();
  const request = body.match(/^依頼:\s*(.+)$/m)?.[1]?.trim();
  if (!condition) throw new Error(`${file}: 本文に「条件:」の行が無い`);
  if (!request) throw new Error(`${file}: 本文に「依頼:」の行が無い`);
  return { file, route: meta.route, deadline: meta.deadline, requester: meta.requester, condition, request };
}

const TICKETS_DIR = join(process.cwd(), "tickets");

export function loadTickets(): Ticket[] {
  const files = readdirSync(TICKETS_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
  if (files.length === 0) throw new Error("tickets/ に依頼票（路線名.md）が1枚も無い");
  return files.map((f) => parseTicket(f, readFileSync(join(TICKETS_DIR, f), "utf8")));
}
