"use client";
import { useEffect, useId, useState } from "react";

let inited = false;

async function render(id: string, code: string) {
  const mermaid = (await import("mermaid")).default;
  if (!inited) {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral", fontFamily: "inherit", flowchart: { htmlLabels: false, curve: "basis" } });
    inited = true;
  }
  const clean = code.replace(/```(mermaid)?/g, "").trim();
  const { svg } = await mermaid.render(id, clean);
  return svg;
}

export default function Mermaid({ code, title, caption }: { code: string; title: string; caption: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await render(`m${id}`, code);
        if (!cancelled) setSvg(s);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 描画失敗 → 1回だけ AI に修復を依頼して再描画
        if (cancelled) return;
        setFixing(true);
        try {
          const r = await fetch("/api/diagram/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, error: msg }) });
          const d = (await r.json()) as { code?: string };
          if (d.code) {
            const s = await render(`m${id}b`, d.code);
            if (!cancelled) setSvg(s);
            return;
          }
          throw new Error(msg);
        } catch (e2) {
          if (!cancelled) setErr(e2 instanceof Error ? e2.message : String(e2));
        } finally {
          if (!cancelled) setFixing(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [code, id]);

  // 最終フォールバック：ノードのラベルだけを箇条書きに
  const labels = Array.from(code.matchAll(/\["([^"]+)"\]|\("([^"]+)"\)|\{"([^"]+)"\}|\(\("([^"]+)"\)\)/g)).map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);

  return (
    <figure className="card p-4">
      <figcaption className="font-medium mb-2">{title}</figcaption>
      {svg ? (
        <div className="mermaid-box overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : err ? (
        labels.length ? <ul className="list-disc pl-5 text-sm">{Array.from(new Set(labels)).map((l, i) => <li key={i}>{l}</li>)}</ul> : <pre className="text-xs text-muted whitespace-pre-wrap">{code}</pre>
      ) : (
        <div className="h-24 pulse text-sm text-muted">{fixing ? "図を修復中…" : "図を描画中…"}</div>
      )}
      <p className="text-sm text-muted mt-2">{caption}</p>
    </figure>
  );
}
