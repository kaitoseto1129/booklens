"use client";
import { useState } from "react";
import type { Quiz as QuizT } from "@/lib/ai/schemas";

export default function Quiz({ bookId }: { bookId: string }) {
  const [quiz, setQuiz] = useState<QuizT | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});

  async function start() {
    setLoading(true); setErr(null); setPicked({});
    try {
      const r = await fetch(`/api/books/${bookId}/quiz`, { method: "POST" });
      const d = (await r.json()) as { result?: QuizT; error?: string };
      if (d.error) setErr(d.error); else setQuiz(d.result ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">理解度クイズ</h2>
        <button onClick={start} disabled={loading} className="text-sm rounded-full bg-accent text-white px-4 py-1.5 disabled:opacity-50">{quiz ? "作り直す" : "3問を出す"}</button>
      </div>
      {loading && <p className="mt-3 text-sm text-muted pulse">クイズを作成しています…</p>}
      {err && <p className="mt-3 text-sm text-accent">{err}</p>}
      {quiz && (
        <ol className="mt-4 space-y-4">
          {quiz.questions.map((q, qi) => {
            const sel = picked[qi];
            return (
              <li key={qi}>
                <div className="font-medium text-sm mb-2">{qi + 1}. {q.question}</div>
                <div className="space-y-1.5">
                  {q.choices.map((c, ci) => {
                    const chosen = sel === ci;
                    const answered = sel !== undefined;
                    const correct = ci === q.answer_index;
                    const cls = !answered ? "border-line hover:border-accent" : correct ? "border-green-500 bg-green-500/10" : chosen ? "border-accent bg-accent-soft" : "border-line opacity-60";
                    return <button key={ci} onClick={() => sel === undefined && setPicked((p) => ({ ...p, [qi]: ci }))} className={`block w-full text-left text-sm rounded-lg border px-3 py-2 ${cls}`}>{c}{answered && correct ? " ✓" : ""}</button>;
                  })}
                </div>
                {sel !== undefined && <p className="text-xs text-muted mt-1.5">{sel === q.answer_index ? "正解！" : "惜しい。"} {q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
