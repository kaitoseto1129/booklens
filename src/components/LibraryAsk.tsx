"use client";
import { useState } from "react";
import type { LibraryAnswer } from "@/lib/ai/schemas";

export default function LibraryAsk() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<LibraryAnswer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    if (q.trim().length < 4 || loading) return;
    setLoading(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/library/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q.trim() }) });
      const d = (await r.json()) as { result?: LibraryAnswer; error?: string };
      if (d.error) setErr(d.error); else setRes(d.result ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  return (
    <section className="card p-5 mb-6">
      <h2 className="font-semibold mb-1">本棚に横断で質問</h2>
      <p className="text-xs text-muted mb-3">これまで読んだ本すべてから、答えをまとめます。</p>
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：今まで読んだ本から、意思決定について重要な考えをまとめて" className="flex-1 rounded-full border border-line bg-bg px-4 py-2.5 text-sm outline-none focus:border-accent" />
        <button disabled={loading || q.trim().length < 4} className="rounded-full bg-accent text-white px-4 py-2 text-sm disabled:opacity-50 shrink-0">質問</button>
      </form>
      {loading && <p className="mt-3 text-sm text-muted pulse">本棚を横断してまとめています…</p>}
      {err && <p className="mt-3 text-sm text-accent">{err}</p>}
      {res && (
        <div className="mt-4 space-y-3">
          <p className="text-lg font-semibold">{res.headline}</p>
          <ul className="space-y-2">{res.points.map((p, i) => <li key={i}><div className="font-medium text-sm">{p.point}</div><p className="text-sm text-muted">{p.detail}</p>{p.books.length > 0 && <div className="text-[11px] text-muted">📖 {p.books.join(" / ")}</div>}</li>)}</ul>
          <p className="text-sm">{res.synthesis}</p>
          {res.note && <p className="text-xs text-muted">※ {res.note}</p>}
        </div>
      )}
    </section>
  );
}
