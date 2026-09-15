import { stepAverages, type TimelineEntry } from "./db";

/** 標準的なステップ列と既定の所要時間（ms）。実績が溜まるほど実績側に寄せる。 */
// Sonnet 5 + 並列化（verifyとvisualsを同時実行）+ 書き直しループ廃止 後の実測ベース（合計 約5分）
const DEFAULTS: Record<string, number> = {
  identify: 3_000, prefetch: 6_000, quick: 12_000, availability: 3_000, fulltext: 5_000,
  research: 70_000, sources: 20_000, gapfill: 40_000, extract: 35_000, summarize: 120_000, verify: 30_000,
};
const SEQUENCE = ["identify", "prefetch", "quick", "availability", "research", "sources", "extract", "summarize", "verify"];
const OPTIONAL: Record<string, number> = { gapfill: 0.4 }; // 発生確率で期待値に加える（書き直しは廃止）

let cache: { at: number; avg: Record<string, number> } | null = null;
function averages() {
  if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), avg: stepAverages() };
  return cache.avg;
}
function expected(step: string): number {
  const avg = averages();
  const d = DEFAULTS[step] ?? 30_000;
  const a = avg[step];
  if (!a) return d;
  return (a * 3 + d) / 4; // 実績を重めに
}

/** 新規1冊の想定合計（秒） */
export function estimateTotalSeconds(): number {
  let ms = SEQUENCE.reduce((s, st) => s + expected(st), 0);
  for (const [st, p] of Object.entries(OPTIONAL)) ms += expected(st) * p + (st === "revise" ? expected("verify") * p : 0);
  return Math.round(ms / 1000);
}

export function estimateQuickSeconds(): number {
  return Math.round(["identify", "prefetch", "quick"].reduce((s, st) => s + expected(st), 0) / 1000);
}

/** 進行中の解析の経過・残り時間（秒） */
export function estimateRemaining(timeline: TimelineEntry[] | null, startedAt: string | null): { elapsed: number; remaining: number; steps: { step: string; label: string; ms: number | null; expected: number; state: "done" | "active" | "pending" }[] } {
  const now = Date.now();
  const start = startedAt ? Date.parse(startedAt) : timeline?.[0]?.started_at ?? now;
  const elapsed = Math.max(0, Math.round((now - start) / 1000));
  const tl = timeline ?? [];
  const done = new Set(tl.filter((t) => t.ended_at).map((t) => t.step));
  const active = tl.find((t) => !t.ended_at) ?? null;

  let remainingMs = 0;
  const steps: ReturnType<typeof estimateRemaining>["steps"] = [];
  for (const t of tl) {
    steps.push({ step: t.step, label: t.label, ms: t.ended_at ? t.ended_at - t.started_at : null, expected: expected(t.step), state: t.ended_at ? "done" : "active" });
  }
  if (active) remainingMs += Math.max(expected(active.step) - (now - active.started_at), expected(active.step) * 0.1);
  const idx = active ? SEQUENCE.indexOf(active.step) : -1;
  for (const st of SEQUENCE) {
    if (done.has(st) || st === active?.step) continue;
    if (idx >= 0 && SEQUENCE.indexOf(st) < idx) continue; // 既に通過した（Aタイプでresearchを飛ばす等）
    remainingMs += expected(st);
    steps.push({ step: st, label: LABELS[st] ?? st, ms: null, expected: expected(st), state: "pending" });
  }
  // 任意ステップの期待値（未実行かつまだその段階に達していない場合）
  if (!done.has("gapfill") && active?.step !== "gapfill" && !done.has("extract") && active?.step !== "extract") remainingMs += expected("gapfill") * OPTIONAL.gapfill;
  if (!done.has("revise") && active?.step !== "revise") remainingMs += (expected("revise") + expected("verify")) * OPTIONAL.revise;
  return { elapsed, remaining: Math.max(5, Math.round(remainingMs / 1000)), steps };
}

const LABELS: Record<string, string> = {
  identify: "本を特定", prefetch: "公式情報・目次", quick: "速報版", availability: "本文の有無を確認", research: "Webで情報収集",
  sources: "情報源を整理", extract: "概念・主張を抽出", summarize: "要約を作成", verify: "情報源と照合", revise: "書き直し", gapfill: "追加調査",
};
export const STEP_LABELS = LABELS;
