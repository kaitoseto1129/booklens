"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mermaid from "./Mermaid";
import type { VideoSceneT } from "@/lib/ai/schemas";

// 学習モードで挿入する復習カードを持てる拡張シーン型（_recall は動画内だけの一時データ）
type PS = VideoSceneT & { _recall?: { title: string; points: string[] } };

const sceneSec = (sc: PS, rate: number) => Math.max(3, Math.round(((sc.narration || sc.subtitle || sc.heading).length / 7.5) / rate));
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

function mk(p: Partial<PS>): PS {
  return { chapter: "", narration: "", subtitle: "", visual_type: "keyword", heading: "", items: [], mermaid: "", compare: [], compare_titles: [], x_axis: "", y_axis: "", quadrants: [], quote_author: "", source_refs: [], ...p };
}

/** 章ごとに復習（リコール）カードを挿入する。 */
function withRecall(scenes: VideoSceneT[]): PS[] {
  const out: PS[] = [];
  let chapTitle = "";
  let heads: string[] = [];
  const flush = () => {
    if (chapTitle && !/はじめに|まとめ|全体像|以上/.test(chapTitle) && heads.length) {
      out.push(mk({ _recall: { title: chapTitle, points: heads.slice(0, 4) }, heading: chapTitle, narration: `ここで少し復習です。${chapTitle}で大事だったことを、思い出してみましょう。` }));
    }
    heads = [];
  };
  scenes.forEach((s) => {
    if (s.chapter) { flush(); chapTitle = s.chapter; }
    out.push(s as PS);
    if (s.heading && s.visual_type !== "title") heads.push(s.heading);
  });
  flush();
  return out;
}

function SceneView({ sc, revealed, onReveal }: { sc: PS; revealed: boolean; onReveal: () => void }) {
  const wide = sc.visual_type === "flowchart" || sc.visual_type === "conceptmap";
  const base = `scene slide ${wide ? "" : "ken"} w-full ${wide ? "" : "max-w-3xl"} mx-auto px-6 text-center`;

  if (sc._recall) {
    return (
      <div className={`scene slide recall`}>
        <div className="badge">復習クイズ</div>
        <div className="q">{sc._recall.title}<br />で学んだことは？</div>
        {revealed ? (
          <ul>{sc._recall.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        ) : (
          <button onClick={onReveal} className="reveal-btn rounded-full bg-accent text-white px-5 py-2.5 text-sm">答えを見る</button>
        )}
      </div>
    );
  }
  if (wide && sc.mermaid) {
    return <div className={base}><div className="text-xs tracking-[0.2em] uppercase text-accent mb-4">{sc.heading}</div><div className="mm text-left"><Mermaid code={sc.mermaid} title="" caption="" /></div></div>;
  }
  if (sc.visual_type === "matrix" && sc.quadrants.length === 4) {
    const cell = (i: number, tone: string) => (
      <div className={`rounded-lg p-4 min-h-[110px] item-in ${tone}`} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
        <div className="text-sm font-semibold mb-1">{sc.quadrants[i]?.label}</div>
        <ul className="text-xs space-y-0.5 list-disc pl-4 text-left">{(sc.quadrants[i]?.items ?? []).map((it, k) => <li key={k}>{it}</li>)}</ul>
      </div>
    );
    return (
      <div className={base}>
        <div className="text-xs tracking-[0.2em] uppercase text-accent mb-4">{sc.heading}</div>
        <div className="flex gap-2 max-w-2xl mx-auto">
          <div className="flex items-center"><span className="text-xs text-muted [writing-mode:vertical-rl] rotate-180">{sc.y_axis}</span></div>
          <div className="flex-1">
            <div className="grid grid-cols-2 gap-2">{cell(0, "bg-book-soft")}{cell(1, "bg-accent-soft")}{cell(2, "bg-bg border border-line")}{cell(3, "bg-book-soft")}</div>
            <div className="text-center text-xs text-muted mt-1">{sc.x_axis} →</div>
          </div>
        </div>
      </div>
    );
  }
  if (sc.visual_type === "comparison" && sc.compare.length) {
    const [l, r] = sc.compare_titles;
    return (
      <div className={base}>
        <div className="text-xs tracking-[0.2em] uppercase text-accent mb-4">{sc.heading}</div>
        <div className="overflow-x-auto max-w-2xl mx-auto"><table className="w-full text-sm border-collapse">
          <thead><tr><th></th><th className="px-3 py-2 tag-book rounded-t text-left text-base">{l}</th><th className="px-3 py-2 tag-insight rounded-t text-left text-base">{r}</th></tr></thead>
          <tbody>{sc.compare.map((c, i) => <tr key={i} className="align-top item-in" style={{ animationDelay: `${0.1 + i * 0.08}s` }}><td className="text-xs text-muted px-2 py-2.5 border-b border-line">{c.aspect}</td><td className="px-3 py-2.5 border-b border-line text-left">{c.left}</td><td className="px-3 py-2.5 border-b border-line text-left">{c.right}</td></tr>)}</tbody>
        </table></div>
      </div>
    );
  }
  if (sc.visual_type === "bullets" && sc.items.length) {
    return <div className={base}><div className="text-xs tracking-[0.2em] uppercase text-accent mb-5">{sc.heading}</div><ul className="text-left inline-block space-y-3">{sc.items.map((it, i) => <li key={i} className="flex gap-3 text-lg sm:text-2xl leading-relaxed item-in" style={{ animationDelay: `${0.15 + i * 0.12}s` }}><span className="text-accent mt-1">—</span><span>{it}</span></li>)}</ul></div>;
  }
  if (sc.visual_type === "timeline" && sc.items.length) {
    return <div className={base}><div className="text-xs tracking-[0.2em] uppercase text-accent mb-5">{sc.heading}</div><ol className="text-left inline-block space-y-4">{sc.items.map((it, i) => <li key={i} className="flex gap-3 items-start item-in" style={{ animationDelay: `${0.15 + i * 0.12}s` }}><span className="w-7 h-7 rounded-full bg-accent text-white text-sm flex items-center justify-center shrink-0">{i + 1}</span><span className="text-lg sm:text-xl">{it}</span></li>)}</ol></div>;
  }
  if (sc.visual_type === "stat" && sc.items.length) {
    return <div className={base}><div className="text-xs tracking-[0.2em] uppercase text-accent mb-5">{sc.heading}</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-xl mx-auto">{sc.items.map((it, i) => { const [v, l] = it.split("｜"); return <div key={i} className="rounded-xl bg-accent-soft p-4 item-in" style={{ animationDelay: `${0.1 + i * 0.1}s` }}><div className="font-display text-3xl text-accent">{v}</div><div className="text-xs text-muted mt-1">{l}</div></div>; })}</div></div>;
  }
  if (sc.visual_type === "quote") {
    return <div className={base}><blockquote className="font-display text-3xl sm:text-4xl leading-snug kw-in">“{sc.heading}”</blockquote>{sc.quote_author && <div className="mt-4 text-sm text-muted">— {sc.quote_author}</div>}</div>;
  }
  if (sc.visual_type === "title") {
    return <div className={base}><h1 className="font-display text-5xl sm:text-6xl leading-tight kw-in">{sc.heading}</h1>{sc.subtitle && <p className="mt-5 text-muted text-lg">{sc.subtitle}</p>}</div>;
  }
  return (
    <div className={base}>
      {sc.subtitle && <div className="text-xs tracking-[0.2em] uppercase text-accent mb-4">{sc.subtitle}</div>}
      <div className="font-display text-4xl sm:text-5xl leading-snug kw-in">{sc.heading}</div>
      <div className="mx-auto mt-5 h-0.5 w-16 bg-accent/70 kw-rule" />
    </div>
  );
}

export default function VideoPlayer({ bookId, scenes: rawScenes, length, onClose }: { bookId: string; scenes: VideoSceneT[]; length: number; onClose: () => void }) {
  const [learn, setLearn] = useState(false);
  const scenes = useMemo(() => (learn ? withRecall(rawScenes) : (rawScenes as PS[])), [learn, rawScenes]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const [showSub, setShowSub] = useState(true);
  const [ttsOK, setTtsOK] = useState(() => typeof window !== "undefined" && !!window.speechSynthesis);
  const [ask, setAsk] = useState(false);
  const [revealAt, setRevealAt] = useState(-1); // 復習カードで答えを見せたシーン
  const [nudge, setNudge] = useState(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const playingRef = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const chapters = useMemo(() => scenes.map((sc, i) => ({ i, title: sc.chapter })).filter((c) => c.title), [scenes]);
  const secs = useMemo(() => scenes.map((sc) => sceneSec(sc, rate)), [scenes, rate]);
  const total = useMemo(() => secs.reduce((a, b) => a + b, 0), [secs]);
  const elapsedTo = (n: number) => secs.slice(0, n).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    const pick = () => { const vs = synth.getVoices(); voiceRef.current = vs.find((v) => v.lang === "ja-JP") ?? vs.find((v) => v.lang.startsWith("ja")) ?? null; };
    pick(); synth.addEventListener("voiceschanged", pick);
    return () => synth.removeEventListener("voiceschanged", pick);
  }, []);

  const clampIdx = useCallback((i: number) => Math.max(0, Math.min(scenes.length - 1, i)), [scenes.length]);
  const advance = useCallback(() => setIdx((i) => (i + 1 >= scenes.length ? (setPlaying(false), i) : i + 1)), [scenes.length]);

  const sc = scenes[Math.min(idx, scenes.length - 1)];
  const isRecall = Boolean(sc?._recall);
  const revealed = revealAt === idx;

  // 読み上げ＋自動送り（復習カードは自動送りせず、ユーザー操作を待つ）
  useEffect(() => {
    if (!playing || ask) { window.speechSynthesis?.cancel(); return; }
    let cancelled = false;
    const cur = scenes[idx];
    const speakOnly = Boolean(cur?._recall);
    if (ttsOK && typeof window !== "undefined" && window.speechSynthesis && cur?.narration) {
      const synth = window.speechSynthesis;
      synth.cancel();
      try { synth.resume(); } catch { /* noop */ }
      const u = new SpeechSynthesisUtterance(cur.narration);
      u.lang = "ja-JP"; u.rate = rate; if (voiceRef.current) u.voice = voiceRef.current;
      u.onend = () => { if (!cancelled && playingRef.current && !speakOnly) advance(); };
      u.onerror = () => { setTtsOK(false); };
      synth.speak(u);
      const keepAlive = setInterval(() => { try { if (synth.speaking) synth.resume(); } catch { /* noop */ } }, 8000);
      return () => { cancelled = true; clearInterval(keepAlive); synth.cancel(); };
    }
    if (speakOnly) return; // 音声なし環境でも復習カードは待つ
    const t = setTimeout(() => { if (!cancelled && playingRef.current) advance(); }, secs[idx] * 1000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [idx, playing, ask, ttsOK, rate, scenes, secs, advance, nudge]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!playingRef.current || !window.speechSynthesis) return;
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
      if (!window.speechSynthesis.speaking) setNudge((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); window.removeEventListener("pageshow", onVisible); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") setIdx((i) => clampIdx(i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => clampIdx(i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.speechSynthesis?.cancel(); };
  }, [clampIdx, onClose]);

  const curChapter = [...chapters].reverse().find((c) => c.i <= idx)?.title ?? "";
  const chapterStart = Boolean(sc?.chapter); // このシーンが章の先頭

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="flex items-center justify-between px-4 h-11 text-sm border-b border-line/60">
        <span className="text-muted truncate">{length}分解説 · {curChapter}</span>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => { setLearn((v) => !v); setIdx(0); setRevealAt(-1); }} className={`text-xs rounded-full border px-2.5 py-1 ${learn ? "border-accent text-accent" : "border-line text-muted"}`} title="章ごとに復習クイズを挟む">学習モード</button>
          <button onClick={() => rootRef.current?.requestFullscreen?.().catch(() => {})} className="text-muted hover:text-fg" title="全画面">⛶</button>
          <button onClick={onClose} className="text-muted hover:text-fg">✕ 閉じる</button>
        </div>
      </div>

      <div className="vp-stage flex-1 flex items-center justify-center overflow-y-auto py-6">
        <div className="vp-vignette" />
        <SceneView key={idx} sc={sc} revealed={revealed} onReveal={() => setRevealAt(idx)} />
        {chapterStart && !isRecall && (
          <div className="chapcard run" key={`ch-${idx}`}>
            <div className="inner"><div className="ey">Chapter</div><h2>{sc.chapter}</h2></div>
          </div>
        )}
        <div className="vp-mark">BookLens</div>
      </div>

      {showSub && !isRecall && (sc.subtitle || sc.narration) && (
        <div className="px-6 pb-2 text-center"><span className="inline-block bg-fg/85 text-bg rounded-lg px-3 py-1.5 text-sm max-w-2xl">{sc.subtitle || sc.narration}</span></div>
      )}
      {isRecall && (
        <div className="px-6 pb-2 text-center">
          <button onClick={() => { setRevealAt(-1); advance(); }} className="rounded-full border border-accent text-accent px-4 py-1.5 text-sm">次へ進む ›</button>
        </div>
      )}

      <div className="px-4">
        <div className="relative h-1.5 rounded-full bg-line overflow-hidden">
          <div className="seek-fill h-full bg-accent" style={{ width: `${(elapsedTo(playing && !ask && !isRecall ? idx + 1 : idx) / total) * 100}%`, transition: playing && !ask && !isRecall ? `width ${secs[idx]}s linear` : "none" }} />
          {chapters.map((c) => <span key={c.i} className="absolute top-0 w-px h-full bg-bg" style={{ left: `${(elapsedTo(c.i) / total) * 100}%` }} />)}
        </div>
        <div className="flex justify-between text-[11px] text-muted mt-1 tabular-nums"><span>{fmt(elapsedTo(idx))}</span><span>{fmt(total)}</span></div>
      </div>

      <div className="px-4 py-3 flex items-center gap-3 flex-wrap justify-center">
        <button onClick={() => setIdx((i) => clampIdx(i - 1))} disabled={idx === 0} className="text-xl disabled:opacity-30 w-9">‹</button>
        <button onClick={() => setPlaying((p) => !p)} className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center">{playing ? "❚❚" : "▶"}</button>
        <button onClick={() => setIdx((i) => clampIdx(i + 1))} disabled={idx === scenes.length - 1} className="text-xl disabled:opacity-30 w-9">›</button>
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="text-xs rounded border border-line bg-card px-1.5 py-1" title="速度">
          {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
        <button onClick={() => setShowSub((v) => !v)} className={`text-xs rounded-full border px-3 py-1.5 ${showSub ? "border-accent text-accent" : "border-line text-muted"}`}>字幕</button>
        <button onClick={() => { setPlaying(false); setAsk(true); }} className="text-xs rounded-full border border-line px-3 py-1.5 hover:border-accent">？ ここが分からない</button>
        <select onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) setIdx(v); }} value="" className="text-xs rounded border border-line bg-card px-1.5 py-1" title="チャプター">
          <option value="">章へ移動</option>
          {chapters.map((c) => <option key={c.i} value={c.i}>{fmt(elapsedTo(c.i))} {c.title}</option>)}
        </select>
      </div>

      {ask && <SceneAsk bookId={bookId} scene={sc} onClose={() => { setAsk(false); setPlaying(true); }} />}
    </div>
  );
}

function SceneAsk({ bookId, scene, onClose }: { bookId: string; scene: VideoSceneT; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setAns("");
    const ctx = `（動画のシーン「${scene.heading || scene.subtitle}」について）${question}`;
    try {
      const res = await fetch(`/api/books/${bookId}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: ctx }) });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader(); const dec = new TextDecoder();
      for (;;) { const { value, done } = await reader.read(); if (done) break; setAns((a) => a + dec.decode(value, { stream: true })); }
    } catch (e) { setAns(`エラー: ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(false); }
  }
  return (
    <div className="absolute inset-0 bg-bg/95 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-2"><h3 className="font-semibold">このシーンについて質問</h3><button onClick={onClose} className="text-muted">✕</button></div>
        <p className="text-xs text-muted mb-3">シーン：{scene.heading || scene.subtitle}</p>
        <div className="flex flex-wrap gap-1.5 mb-2">{["もっと簡単に説明して", "具体例をもう1つ", "自分の仕事でどう使う？"].map((x) => <button key={x} onClick={() => { setQ(x); send(x); }} className="text-xs rounded-full border border-line px-2.5 py-1 hover:border-accent">{x}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：これもう少し簡単に" className="flex-1 rounded-full border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
          <button disabled={busy || !q.trim()} className="rounded-full bg-accent text-white px-4 text-sm disabled:opacity-50">送信</button>
        </form>
        {(ans || busy) && <div className="mt-3 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{ans || <span className="pulse text-muted">考えています…</span>}</div>}
      </div>
    </div>
  );
}
