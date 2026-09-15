"use client";
import { useEffect, useId, useRef, useState } from "react";

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
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await render(`m${id}`, code);
        if (!cancelled) setSvg(s);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (cancelled) return;
        setFixing(true);
        try {
          const r = await fetch("/api/diagram/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, error: msg }) });
          const d = (await r.json()) as { code?: string };
          if (d.code) { const s = await render(`m${id}b`, d.code); if (!cancelled) setSvg(s); return; }
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

  // 描画後：ノードをクリックできるようにして、押すと AI にその概念の説明を頼む
  useEffect(() => {
    if (!svg || !boxRef.current) return;
    const nodes = boxRef.current.querySelectorAll<SVGGElement>("g.node");
    const handlers: { el: SVGGElement; fn: () => void }[] = [];
    nodes.forEach((el) => {
      const text = (el.textContent || "").trim();
      if (!text) return;
      el.style.cursor = "pointer";
      const fn = () => window.dispatchEvent(new CustomEvent("booklens-explain", { detail: `図の「${text}」について、中学生でも分かるように、具体例つきで説明して。` }));
      el.addEventListener("click", fn);
      handlers.push({ el, fn });
    });
    return () => handlers.forEach((h) => h.el.removeEventListener("click", h.fn));
  }, [svg]);

  const labels = Array.from(code.matchAll(/\["([^"]+)"\]|\("([^"]+)"\)|\{"([^"]+)"\}|\(\("([^"]+)"\)\)/g)).map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);

  return (
    <figure className="card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <figcaption className="font-medium">{title}</figcaption>
        {svg && <span className="text-[11px] text-muted">語句をタップで解説</span>}
      </div>
      {svg ? (
        <div ref={boxRef} className="mermaid-box overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : err ? (
        labels.length ? <ul className="list-disc pl-5 text-sm">{Array.from(new Set(labels)).map((l, i) => <li key={i}>{l}</li>)}</ul> : <pre className="text-xs text-muted whitespace-pre-wrap">{code}</pre>
      ) : (
        <div className="h-24 pulse text-sm text-muted">{fixing ? "図を修復中…" : "図を描画中…"}</div>
      )}
      <p className="text-sm text-muted mt-2">{caption}</p>
    </figure>
  );
}
