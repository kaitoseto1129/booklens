"use client";
import React from "react";
import Mermaid from "./Mermaid";

/** 依存なしの軽量Markdownレンダラ（チャット回答用）。**太字** / ## 見出し / - 箇条書き / ```mermaid``` 図 / 段落。 */
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
  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = raw.trimEnd();

    // ``` コードフェンス（mermaid は図に変換） */
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flush();
      const lang = (fence[1] || "").toLowerCase();
      const code: string[] = [];
      let closed = false;
      idx++;
      for (; idx < lines.length; idx++) {
        if (/^\s*```\s*$/.test(lines[idx])) { closed = true; break; }
        code.push(lines[idx]);
      }
      const codeStr = code.join("\n").trim();
      if (lang === "mermaid") {
        if (closed && codeStr) blocks.push(<div key={`mm${key++}`} className="my-2"><Mermaid code={codeStr} title="" caption="" /></div>);
        else blocks.push(<div key={`mm${key++}`} className="my-2 text-xs text-muted pulse">図を生成中…</div>);
      } else if (codeStr) {
        blocks.push(<pre key={`pre${key++}`} className="my-2 overflow-x-auto rounded-lg bg-line/40 p-3 text-xs leading-relaxed"><code>{codeStr}</code></pre>);
      }
      continue;
    }

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
