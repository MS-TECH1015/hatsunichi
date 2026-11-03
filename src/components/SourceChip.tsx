"use client";
import { useState } from "react";

export type SourceMeta = {
  source_id: string;
  name: string;
  provider: string;
  url: string;
  date: string;
  license: string;
  note?: string;
};

// 数字の横に置く「出典」の札。押すと表の名前・日付・URL・計算式が開く
export function SourceChip({ source, formula, label = "出典" }: { source?: SourceMeta; formula?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!source) return <span className="chip chip-assumed">仮定</span>;
  return (
    <span className="chip-wrap">
      <button type="button" className="chip" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <span className="chip-pop" role="dialog">
          <strong>{source.name}</strong>
          <span>{source.provider}</span>
          <span>取得 {source.date}</span>
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.url}
          </a>
          <span>{source.license}</span>
          {formula && <span className="formula">式: {formula}</span>}
        </span>
      )}
    </span>
  );
}
