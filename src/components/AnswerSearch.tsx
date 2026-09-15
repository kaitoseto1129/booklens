"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AnswerResult } from "@/lib/ai/schemas";
import type { Candidate } from "@/lib/books/types";

const EXAMPLES = ["部下へのフィードバックが苦手", "続く習慣の作り方", "値付け・価格戦略の考え方", "意思決定で後悔しない方法"];

export default function AnswerSearch() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AnswerResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const router = useRouter();

  async function ask(question: string) {
    if (question.trim().length < 4 || loading) return;
    setLoading(true); setErr(null); setRes(null);
    try {
      const r = await fetch(`/api/answer?q=${encodeURIComponent(question.trim())}`);
      const d = (await r.json()) as { result?: AnswerResult; error?: string };
      if (d.error) setErr(d.error); else setRes(d.result ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // 根拠の本を開く（検索で特定 → 生成開始 → ページへ）
  async function openBook(title: string, author: string, isbn13: string | null, i: number) {
    setOpening(i);
    try {
      let cand: Candidate | null = null;
      const r = await fetch(`/api/search?q=${encodeURIComponent(isbn13 || `${title} ${author}`)}`);
      const d = (await r.json()) as { candidates: Candidate[] };
      cand = d.candidates[0] ?? null;
      if (!cand) { // AI検索フォールバック
        const r2 = await fetch(`/api/search/ai?q=${encodeURIComponent(`${title} ${author}`)}`);
        const d2 = (await r2.json()) as { candidates?: Candidate[] };
        cand = d2.candidates?.[0] ?? null;
      }
      if (!cand) { setOpening(null); return; }
      const rb = await fetch("/api/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cand) });
      const db = (await rb.json()) as { id: string };
      router.push(`/books/${db.id}`);
    } catch {
      setOpening(null);
    }
  }

  return (
    <div className="max-w-xl mx-auto text-left">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          rows={2}
          placeholder="悩み・知りたいことを入力（例：部下へのフィードバックが苦手）"
          className="w-full rounded-2xl border border-line bg-card px-5 py-3.5 text-base shadow-sm outline-none focus:border-accent resize-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => <button type="button" key={e} onClick={() => { setQ(e); ask(e); }} className="text-xs rounded-full border border-line px-2.5 py-1 hover:border-accent">{e}</button>)}
          </div>
          <button disabled={loading || q.trim().length < 4} className="rounded-full bg-accent text-white px-5 py-2 text-sm disabled:opacity-50 shrink-0">答えを出す</button>
        </div>
      </form>

      {loading && <div className="mt-6 card p-5 text-sm text-muted pulse">複数の本を調べて、共通する答えをまとめています…（20〜40秒）</div>}
      {err && <div className="mt-6 card p-4 text-sm text-accent">{err}</div>}

      {res && (
        <div className="mt-6 space-y-4">
          <section className="card p-5 border-accent/40 bg-accent-soft/30">
            <div className="text-xs text-accent mb-1">結論</div>
            <p className="text-lg font-semibold leading-snug">{res.headline}</p>
          </section>
          <section className="space-y-2">
            {res.points.map((p, i) => (
              <div key={i} className="card p-4">
                <div className="flex gap-2"><span className="text-accent font-semibold">{i + 1}.</span><div>
                  <div className="font-medium">{p.point}</div>
                  <p className="text-sm text-muted mt-0.5">{p.detail}</p>
                  {p.books.length > 0 && <div className="text-[11px] text-muted mt-1">📖 {p.books.join(" / ")}</div>}
                </div></div>
              </div>
            ))}
          </section>
          <section>
            <h3 className="text-sm font-medium text-muted mb-2">この回答の元になった本</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {res.books.map((b, i) => (
                <button key={i} onClick={() => openBook(b.title, b.author, b.isbn13, i)} disabled={opening !== null} className="card p-3 text-left hover:border-accent disabled:opacity-60">
                  <div className="font-medium text-sm">{b.title}</div>
                  <div className="text-xs text-muted">{b.author}</div>
                  <div className="text-xs mt-1">{b.why}</div>
                  <div className="text-xs text-accent mt-1">{opening === i ? "開いています…" : "この本を要約 →"}</div>
                </button>
              ))}
            </div>
          </section>
          {res.caveat && <p className="text-xs text-muted">※ {res.caveat}</p>}
        </div>
      )}
    </div>
  );
}
