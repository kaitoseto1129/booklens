"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type Slide = { kind: string; heading: string; lines: string[]; narration: string; badge?: string };

/** ナレーション付き自動再生スライドプレイヤー（単体本・複数本で共用）。ブラウザ音声合成を使用。 */
export default function SlidePlayer({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1.1);
  const [ttsOK, setTtsOK] = useState(() => typeof window !== "undefined" && !!window.speechSynthesis);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const playingRef = useRef(true);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    const pick = () => {
      const vs = synth.getVoices();
      voiceRef.current = vs.find((v) => v.lang === "ja-JP") ?? vs.find((v) => v.lang.startsWith("ja")) ?? null;
    };
    pick();
    synth.addEventListener("voiceschanged", pick);
    return () => synth.removeEventListener("voiceschanged", pick);
  }, []);

  const speak = useCallback((text: string, onEnd: () => void) => {
    const synth = window.speechSynthesis;
    if (!synth) { onEnd(); return; }
    synth.cancel();
    try { synth.resume(); } catch { /* 一時停止解除 */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP"; u.rate = rate;
    if (voiceRef.current) u.voice = voiceRef.current;
    u.onend = () => onEnd();
    u.onerror = () => { setTtsOK(false); onEnd(); };
    synth.speak(u);
  }, [rate]);

  const advance = useCallback(() => {
    setIdx((i) => (i + 1 >= slides.length ? (setPlaying(false), i) : i + 1));
  }, [slides.length]);

  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    if (!playing) { window.speechSynthesis?.cancel(); return; }
    const slide = slides[idx];
    let cancelled = false;
    if (ttsOK && typeof window !== "undefined" && window.speechSynthesis) {
      speak(slide.narration, () => { if (!cancelled && playingRef.current) advance(); });
      const keepAlive = setInterval(() => { try { if (window.speechSynthesis.speaking) window.speechSynthesis.resume(); } catch { /* noop */ } }, 8000);
      return () => { cancelled = true; clearInterval(keepAlive); window.speechSynthesis?.cancel(); };
    }
    const ms = Math.max(3500, slide.narration.length * 90);
    const t = setTimeout(() => { if (!cancelled && playingRef.current) advance(); }, ms);
    return () => { cancelled = true; clearTimeout(t); };
  }, [idx, playing, ttsOK, slides, speak, advance, nudge]);

  // タブから戻った時に読み上げを復帰
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (!playingRef.current || !window.speechSynthesis) return;
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
      if (!window.speechSynthesis.speaking) setNudge((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(slides.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const s = slides[idx];
  const goto = (i: number) => setIdx(Math.max(0, Math.min(slides.length - 1, i)));

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="flex gap-1 p-3">
        {slides.map((_, i) => (
          <button key={i} onClick={() => goto(i)} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-accent" : "bg-line"}`} aria-label={`スライド${i + 1}`} />
        ))}
      </div>
      <button onClick={onClose} className="absolute top-3 right-4 text-muted hover:text-fg text-sm z-10">✕ 閉じる</button>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full text-center">
          {s.badge && <div className="text-xs tracking-widest text-muted mb-2">{s.badge}</div>}
          <div className="text-xs tracking-widest text-accent mb-4">{s.heading}</div>
          {s.kind === "cover" ? (
            <>
              <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{s.lines[0]}</h1>
              {s.lines[1] && <p className="text-muted mt-2">{s.lines[1]}</p>}
              {s.lines[2] && <p className="text-lg sm:text-xl mt-6 leading-relaxed">{s.lines[2]}</p>}
            </>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold leading-snug">{s.lines[0]}</h2>
              {s.lines[1] && <p className="text-base sm:text-lg text-muted mt-4 leading-relaxed">{s.lines[1]}</p>}
            </>
          )}
        </div>
      </div>

      <div className="p-4 flex items-center justify-center gap-4">
        <button onClick={() => goto(idx - 1)} disabled={idx === 0} className="text-2xl disabled:opacity-30 w-10">‹</button>
        <button onClick={() => setPlaying((p) => !p)} className="w-14 h-14 rounded-full bg-accent text-white text-xl flex items-center justify-center">{playing ? "❚❚" : "▶"}</button>
        <button onClick={() => goto(idx + 1)} disabled={idx === slides.length - 1} className="text-2xl disabled:opacity-30 w-10">›</button>
        <div className="ml-2 flex items-center gap-2 text-xs text-muted">
          <span className="tabular-nums">{idx + 1}/{slides.length}</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded border border-line bg-card px-1.5 py-1">
            {[0.8, 1.0, 1.1, 1.25, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </div>
      </div>
      {!ttsOK && <p className="text-center text-xs text-muted pb-3">※ この環境では音声読み上げが使えないため、スライドのみ自動再生します。</p>}
    </div>
  );
}
