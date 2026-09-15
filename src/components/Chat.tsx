"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import ContextEditor from "./ContextEditor";
import { loadContext, hasContext, contextToText } from "@/lib/context";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGEST_BOOK = ["この本の中心概念を一番簡単に説明すると？", "第1章のポイントは？", "著者の主張の弱点は？"];
const SUGGEST_APPLY = ["この本の考え方を、今の課題の解決にどう使う？", "うちの事業ならどこから実行する？", "この本を前提に90日計画を作って", "この著者なら今の事業をどう評価する？"];

export default function Chat({ bookId, ready }: { bookId: string; ready: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"book" | "apply">("book");
  const [editing, setEditing] = useState(false);
  const [hasCtx, setHasCtx] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/books/${bookId}/ask`).then((r) => r.json()).then((d: { messages: Msg[] }) => setMsgs(d.messages ?? []));
  }, [bookId]);
  useEffect(() => { setHasCtx(hasContext(loadContext())); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);
  useEffect(() => {
    const h = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (q) send(q, true);
    };
    window.addEventListener("booklens-apply", h);
    return () => window.removeEventListener("booklens-apply", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function send(q: string, forceApply = false) {
    if (!q.trim() || busy) return;
    setInput("");
    setBusy(true);
    const useApply = forceApply || mode === "apply";
    if (forceApply) setMode("apply");
    const context = useApply ? contextToText(loadContext()) : undefined;
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`/api/books/${bookId}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, context }) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: c[c.length - 1].content + chunk }; return c; });
      }
    } catch (e) {
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: `エラー: ${e instanceof Error ? e.message : String(e)}` }; return c; });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await fetch(`/api/books/${bookId}/ask`, { method: "DELETE" });
    setMsgs([]);
  }

  const suggestions = mode === "book" ? SUGGEST_BOOK : SUGGEST_APPLY;

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg">✨ AIに質問</h2>
        {msgs.length > 0 && <button onClick={reset} className="text-xs text-muted hover:text-fg">履歴を消す</button>}
      </div>

      {/* モード切替 */}
      <div className="inline-flex p-1 rounded-full bg-bg-tint border border-line/70 text-sm mb-3">
        <button onClick={() => setMode("book")} className={`rounded-full px-4 py-1 transition-colors ${mode === "book" ? "bg-card text-fg font-medium shadow-sm" : "text-muted hover:text-fg"}`}>本について聞く</button>
        <button onClick={() => setMode("apply")} className={`rounded-full px-4 py-1 transition-colors ${mode === "apply" ? "bg-card text-fg font-medium shadow-sm" : "text-muted hover:text-fg"}`}>自分に当てはめる ✨</button>
      </div>

      {mode === "apply" && (
        <div className="mb-3 rounded-xl bg-accent-soft/50 border border-accent/20 p-3 text-xs flex items-center justify-between gap-2">
          <span className="text-muted">
            {hasCtx ? "あなたの事業・立場の情報を使って、この本を具体的に当てはめて答えます。" : "自分・自社の情報を登録すると、あなたの状況に合わせた回答になります。"}
          </span>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded-full border border-accent text-accent px-3 py-1 hover:bg-accent-soft">{hasCtx ? "情報を編集" : "情報を設定"}</button>
        </div>
      )}

      {!ready && <p className="text-sm text-muted">要約の生成が完了すると質問できます。</p>}
      {ready && msgs.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="text-xs rounded-full border border-line px-3 py-1.5 hover:border-accent">{s}</button>)}
        </div>
      )}

      <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[92%] text-left rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-accent-soft whitespace-pre-wrap" : "bg-bg border border-line"}`}>
              {m.content ? (m.role === "assistant" ? <Markdown text={m.content} /> : m.content) : <span className="pulse text-muted">考えています…</span>}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!ready || busy}
          placeholder={mode === "apply" ? "例：この考え方をうちの集客に使うには？" : "例：この本でいうResultingって何？"}
          className="flex-1 rounded-full border border-line bg-bg px-4 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-60"
        />
        <button disabled={!ready || busy || !input.trim()} className="rounded-full bg-accent text-white px-4 py-2 text-sm disabled:opacity-50">送信</button>
      </form>

      {editing && <ContextEditor onClose={() => setEditing(false)} onSaved={() => setHasCtx(hasContext(loadContext()))} />}
    </section>
  );
}
