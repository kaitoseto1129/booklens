"use client";
import React from "react";

/** 依存なしの軽量Markdownレンダラ（チャット回答用）。**太字** / ## 見出し / - 箇条書き / 段落。 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>);
    else if (m[2]) nodes.push(<code key={`${keyBase}-c${i}`} className="px-1 rounded bg-line text-[0.85em]">{m[2]}</code>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;
  const flush = () => {
    if (list.length) {
      const items = [...list];
      blocks.push(
        <ul key={`ul${key++}`} className="list-disc pl-5 space-y-1 my-1">
          {items.map((it, i) => <li key={i}>{inline(it, `li${key}-${i}`)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const b = line.match(/^\s*[-*・]\s+(.*)$/);
    if (h) { flush(); blocks.push(<div key={`h${key++}`} className="font-semibold mt-2 mb-0.5">{inline(h[2], `h${key}`)}</div>); }
    else if (b) { list.push(b[1]); }
    else if (line.trim() === "") { flush(); }
    else { flush(); blocks.push(<p key={`p${key++}`} className="my-1">{inline(line, `p${key}`)}</p>); }
  }
  flush();
  return <div className="space-y-0.5">{blocks}</div>;
}
