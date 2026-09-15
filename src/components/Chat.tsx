"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import ContextEditor from "./ContextEditor";
import { loadContext, hasContext, contextToText } from "@/lib/context";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGEST_BOOK = ["この本の中心概念を一番簡単に説明すると？", "第1章のポイントは？", "著者の主張の弱点は？"];
const SUGGEST_APPLY = ["この本の考え方を、今の課題の解決にどう使う？", "うちの事業ならどこから実行する？", "この本を前提に90日計画を作って", "この著者なら今の事業をどう評価する？"];

export default function Chat({ bookId, ready, bookTitle }: { bookId: string; ready: boolean; bookTitle?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"book" | "apply">("book");
  const [editing, setEditing] = useState(false);
  const [hasCtx, setHasCtx] = useState(false);
  const [ctxName, setCtxName] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  // 音声入力（Web Speech Recognition）
  type SRResultList = ArrayLike<ArrayLike<{ transcript: string }>>;
  type SR = { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: SRResultList }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void; };
  const recRef = useRef<SR | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceOK, setVoiceOK] = useState(false);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceOK(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  function toggleVoice() {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) { recRef.current?.stop(); return; }
    const r = new Ctor();
    r.lang = "ja-JP"; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setInput(t); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r; setListening(true); r.start();
  }

  useEffect(() => {
    fetch(`/api/books/${bookId}/ask`).then((r) => r.json()).then((d: { messages: Msg[] }) => setMsgs(d.messages ?? []));
  }, [bookId]);
  const refreshCtx = () => { const c = loadContext(); setHasCtx(hasContext(c)); setCtxName(c.name || ""); };
  useEffect(() => { refreshCtx(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);
  useEffect(() => {
    const h = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (q) send(q, true);
    };
    const h2 = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      setMode("book");
      document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (q) send(q, false);
    };
    const h3 = (e: Event) => {
      const m = (e as CustomEvent<string>).detail;
      if (m === "book" || m === "apply") setMode(m);
    };
    const h4 = () => setEditing(true);
    window.addEventListener("booklens-apply", h);
    window.addEventListener("booklens-explain", h2);
    window.addEventListener("booklens-mode", h3);
    window.addEventListener("booklens-context-edit", h4);
    return () => {
      window.removeEventListener("booklens-apply", h); window.removeEventListener("booklens-explain", h2);
      window.removeEventListener("booklens-mode", h3); window.removeEventListener("booklens-context-edit", h4);
    };
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
        <h2 className="font-display text-lg">✨ BookLens AI</h2>
        {msgs.length > 0 && <button onClick={reset} className="text-xs text-muted hover:text-fg">履歴を消す</button>}
      </div>

      {/* モード切替 */}
      <div className="inline-flex p-1 rounded-full bg-bg-tint border border-line/70 text-sm mb-3">
        <button onClick={() => setMode("book")} className={`rounded-full px-4 py-1 transition-colors ${mode === "book" ? "bg-card text-fg font-medium shadow-sm" : "text-muted hover:text-fg"}`}>本について聞く</button>
        <button onClick={() => setMode("apply")} className={`rounded-full px-4 py-1 transition-colors ${mode === "apply" ? "bg-card text-fg font-medium shadow-sm" : "text-muted hover:text-fg"}`}>自分に当てはめる ✨</button>
      </div>

      {mode === "apply" && (
        <div className="mb-3 rounded-xl bg-accent-soft/50 border border-accent/20 p-3 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted">参照中</span>
              {bookTitle && <span className="rounded-full bg-book-soft text-book px-2.5 py-1 font-medium">📕 {bookTitle}</span>}
              {hasCtx ? <span className="rounded-full bg-card border border-accent/30 text-accent px-2.5 py-1 font-medium">🏢 {ctxName || "あなたの事業"}</span>
                      : <span className="rounded-full border border-dashed border-line text-muted px-2.5 py-1">🏢 事業情報 未設定</span>}
            </div>
            <button onClick={() => setEditing(true)} className="shrink-0 rounded-full border border-accent text-accent px-3 py-1 hover:bg-accent-soft">{hasCtx ? "情報を編集" : "情報を設定"}</button>
          </div>
          <p className="text-muted mt-1.5">{hasCtx ? "あなたの事業・立場の情報を使って、この本を具体的に当てはめて答えます。" : "自分・自社の情報を登録すると、あなたの状況に合わせた回答になります。"}</p>
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

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2 items-center">
        <div className="flex-1 relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!ready || busy}
            placeholder={listening ? "話してください…" : (mode === "apply" ? "例：この考え方をうちの集客に使うには？" : "例：この本でいうResultingって何？")}
            className="w-full rounded-full border border-line bg-bg pl-4 pr-11 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-60"
          />
          {voiceOK && (
            <button type="button" onClick={toggleVoice} disabled={!ready} title="音声で入力" aria-label="音声で入力"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center ${listening ? "bg-accent text-white animate-pulse" : "text-muted hover:text-accent"}`}>🎤</button>
          )}
        </div>
        <button disabled={!ready || busy || !input.trim()} className="rounded-full bg-accent text-white px-4 py-2 text-sm disabled:opacity-50">送信</button>
      </form>

      {editing && <ContextEditor onClose={() => setEditing(false)} onSaved={() => { refreshCtx(); window.dispatchEvent(new CustomEvent("booklens-context-saved")); }} />}
    </section>
  );
}
