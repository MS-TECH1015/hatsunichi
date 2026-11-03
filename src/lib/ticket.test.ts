import { describe, expect, it } from "vitest";
import { parseTicket } from "./ticket";

const ok = `---
route: 雲山市立病院線
deadline: 2026-11-14
requester: 架空の担当（氏名なし）
---
条件: 夜勤明け9時台の便は残す
依頼: 平日の便のうち3便を減らす案を1枚にする
`;

describe("parseTicket", () => {
  it("4行が取れる", () => {
    const t = parseTicket("a.md", ok);
    expect(t.route).toBe("雲山市立病院線");
    expect(t.deadline).toBe("2026-11-14");
    expect(t.condition).toBe("夜勤明け9時台の便は残す");
    expect(t.request).toBe("平日の便のうち3便を減らす案を1枚にする");
  });
  it("front matter が無ければ落ちる", () => {
    expect(() => parseTicket("a.md", "条件: x\n依頼: y\n")).toThrow(/front matter/);
  });
  it("条件の行が無ければ落ちる", () => {
    expect(() => parseTicket("a.md", ok.replace("条件:", "じょうけん:"))).toThrow(/条件/);
  });
});
