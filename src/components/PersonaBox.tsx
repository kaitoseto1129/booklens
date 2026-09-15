"use client";
import { useState } from "react";
import type { Persona } from "@/lib/ai/schemas";

const PERSONAS = ["経営者", "投資家", "エンジニア", "マーケター", "学生", "管理職"];

export default function PersonaBox({ bookId }: { bookId: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Persona | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(p: string) {
    setActive(p); setLoading(true); setErr(null); setRes(null);
    try {
      const r = await fetch(`/api/books/${bookId}/persona`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona: p }) });
      const d = (await r.json()) as { result?: Persona; error?: string };
      if (d.error) setErr(d.error); else setRes(d.result ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-lg mb-1">自分向けに変換</h2>
      <p className="text-xs text-muted mb-3">あなたの立場に関係する部分だけを抜き出します。</p>
      <div className="flex flex-wrap gap-2">
        {PERSONAS.map((p) => (
          <button key={p} onClick={() => run(p)} disabled={loading} className={`text-sm rounded-full px-3 py-1.5 border ${active === p ? "bg-accent text-white border-accent" : "border-line hover:border-accent"} disabled:opacity-50`}>{p}</button>
        ))}
      </div>
      {loading && <p className="mt-3 text-sm text-muted pulse">「{active}」向けに再構成しています…</p>}
      {err && <p className="mt-3 text-sm text-accent">{err}</p>}
      {res && (
        <div className="mt-4 space-y-3">
          <p className="text-sm"><b>{res.persona_label}にとって：</b>{res.focus}</p>
          <ul className="space-y-2">{res.points.map((p, i) => <li key={i} className="border-l-2 border-accent pl-3"><div className="font-medium text-sm">{p.title}</div><p className="text-sm text-muted">{p.body}</p></li>)}</ul>
          <div><div className="text-xs font-medium text-accent mb-1">今日からできること</div><ol className="list-decimal pl-5 text-sm space-y-0.5">{res.actions.map((a, i) => <li key={i}>{a}</li>)}</ol></div>
          {res.skip.length > 0 && <p className="text-xs text-muted">読み飛ばし可：{res.skip.join(" / ")}</p>}
        </div>
      )}
    </section>
  );
}
