"use client";
import { useEffect, useState } from "react";

export type Eta = {
  elapsed: number;
  remaining: number;
  steps: { step: string; label: string; ms: number | null; expected: number; state: "done" | "active" | "pending" }[];
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const approx = (s: number) => (s < 60 ? `約${Math.max(5, Math.round(s / 5) * 5)}秒` : `約${Math.max(1, Math.round(s / 60))}分`);

export default function ProgressPanel({ eta, stepLabel, progress, receivedAt, quickShown }: { eta: Eta | null; stepLabel: string | null; progress: number; receivedAt: number; quickShown: boolean }) {
  // サーバーの値を受け取った時刻からローカルで1秒ずつ進める
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const drift = now && receivedAt ? Math.max(0, Math.floor((now - receivedAt) / 1000)) : 0;
  const elapsed = (eta?.elapsed ?? 0) + drift;
  const remaining = Math.max(0, (eta?.remaining ?? 0) - drift);
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm pulse">{stepLabel ?? "準備しています"}</span>
        <span className="text-xs text-muted tabular-nums">経過 {fmt(elapsed)}{eta ? ` · 残り${approx(remaining)}` : ""}</span>
      </div>
      <div className="mt-2 h-1.5 rounded bg-line overflow-hidden"><div className="h-full bg-accent transition-all duration-700" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{quickShown ? "速報版を表示中。完全版ができたら自動で差し替わります。" : "まず速報版、その後に完全版（Web収集→要約→事実確認）を表示します。"}</span>
        {eta && <button onClick={() => setShowSteps((v) => !v)} className="underline shrink-0">{showSteps ? "閉じる" : "工程を見る"}</button>}
      </div>
      {showSteps && eta && (
        <ol className="mt-3 space-y-1 text-xs">
          {eta.steps.map((s, i) => (
            <li key={`${s.step}-${i}`} className={`flex items-center gap-2 ${s.state === "pending" ? "text-muted" : ""}`}>
              <span className={`w-4 text-center ${s.state === "done" ? "text-accent" : s.state === "active" ? "pulse" : ""}`}>{s.state === "done" ? "✓" : s.state === "active" ? "●" : "○"}</span>
              <span className="flex-1">{s.label}</span>
              <span className="tabular-nums text-muted">{s.ms != null ? fmt(s.ms / 1000) : s.state === "active" ? fmt(Math.max(0, elapsed - eta.steps.filter((x) => x.ms != null).reduce((a, x) => a + (x.ms ?? 0), 0) / 1000)) : `~${approx(s.expected / 1000)}`}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
