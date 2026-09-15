import type { QA } from "./schemas";
import type { z } from "zod";
import type { SourceListSchema } from "./schemas";

export type Confidence = {
  overall: number;
  groundedness: number;
  coverage: number;
  source_quality: number;
  level: "very_high" | "high" | "standard" | "limited";
  level_label: string;
  basis: string;
};

type SourceList = z.infer<typeof SourceListSchema>;

export function computeConfidence(mode: "A" | "B", sources: SourceList, qa: QA): Confidence {
  const tier1 = sources.sources.filter((s) => s.tier === 1).length;
  const tier2 = sources.sources.filter((s) => s.tier === 2).length;
  const total = sources.sources.length;

  let source_quality: number;
  if (mode === "A") source_quality = 96;
  else {
    source_quality = 35;
    source_quality += Math.min(tier1, 3) * 12;      // 一次情報 最大+36
    source_quality += Math.min(tier2, 2) * 5;       // 二次(公式寄り) 最大+10
    source_quality += Math.min(total, 8) * 1.5;     // 情報源数 最大+12
    if (sources.toc_found) source_quality += 6;
    source_quality = Math.min(95, Math.round(source_quality));
  }

  const overall = Math.round(
    0.4 * qa.groundedness + 0.25 * qa.coverage + 0.35 * source_quality - Math.max(0, qa.hallucination_risk - 20) * 0.3,
  );
  const clamped = Math.max(0, Math.min(99, overall));

  let level: Confidence["level"];
  let label: string;
  let basis: string;
  if (mode === "A" && clamped >= 80) {
    level = "very_high"; label = "非常に高い"; basis = "本文の大部分を確認済み";
  } else if (clamped >= 78 && sources.toc_found && tier1 >= 2) {
    level = "high"; label = "高い"; basis = "目次＋複数の一次情報＋公開情報を確認";
  } else if (clamped >= 60) {
    level = "standard"; label = "標準"; basis = "出版社情報・複数の二次情報を確認";
  } else {
    level = "limited"; label = "限定的"; basis = "十分な情報が取得できていない";
  }
  return { overall: clamped, groundedness: qa.groundedness, coverage: qa.coverage, source_quality, level, level_label: label, basis };
}
