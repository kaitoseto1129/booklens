import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL, EFFORT, addUsage, type Usage } from "./client";
import { GROUNDING_RULES, CORE_TASK, DEPTH_TASK, EXTRAS_TASK, VISUALS_TASK, QA_TASK, EXTRACT_TASK, quickInstructions, prefetchedBlock, bookFactsBlock } from "./prompts";
import { AnalysisCoreSchema, AnalysisDepthSchema, AnalysisExtrasSchema, VisualsSchema, QASchema, QuickSchema, ExtractionSchema, type Analysis, type AnalysisCore, type AnalysisDepth, type AnalysisExtras, type Visuals, type QA, type Quick, type Extraction } from "./schemas";
import type { BookFacts, PrefetchedSource } from "../books/types";

/** 共通の根拠ブロック（キャッシュ対象）＋タスク別ブロック */
export function systemFor(evidenceBlock: string, task: string): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: evidenceBlock, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: `${GROUNDING_RULES}\n\n${task}` },
  ];
}

export async function quickBrief(facts: BookFacts, prefetched: PrefetchedSource[], usage: Usage): Promise<Quick | null> {
  if (prefetched.length === 0) return null;
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 3000,
    system: quickInstructions(),
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(QuickSchema) },
    messages: [{ role: "user", content: `${bookFactsBlock(facts)}\n\n# PRE-FETCHED SOURCES\n${prefetchedBlock(prefetched)}` }],
  });
  addUsage(usage, res);
  return res.parsed_output;
}

/** Pass 1：抽出 */
export async function extractEvidence(evidenceBlock: string, usage: Usage): Promise<Extraction> {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: systemFor(evidenceBlock, EXTRACT_TASK),
    thinking: { type: "disabled" }, // structured+thinking はキャッシュ無効化されるため無効化（effortで深度確保）
    output_config: { effort: EFFORT, format: zodOutputFormat(ExtractionSchema) },
    messages: [{ role: "user", content: "Extract now." }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("extraction: failed to parse structured output");
  return res.parsed_output;
}

/** Pass 2-4：抽出結果を土台に要約を生成。1スキーマが大きすぎるので3分割し、共有 evidence をキャッシュして生成する。 */
export async function generateAnalysis(evidenceBlock: string, extraction: Extraction, usage: Usage, feedback?: { qa: QA; previous: Analysis }): Promise<Analysis> {
  const extractionBlock = `# PASS 1 EXTRACTION (checklist; every item carries S-refs)\n${JSON.stringify(extraction, null, 1)}`;
  const issuesFor = (paths: string[]) => {
    if (!feedback) return "";
    const issues = feedback.qa.issues.filter((i) => paths.some((p) => i.section.startsWith(p)));
    return issues.length ? `\n\n# FACT-CHECK ISSUES to fix in this part (keep what was correct)\n${JSON.stringify(issues, null, 1)}` : "";
  };

  // Part 1: core（速い・軽い） / Part 2: depth（重い）を並列。共有 evidence は1h TTLでキャッシュ。
  const [core, depth] = await Promise.all([
    (async (): Promise<AnalysisCore> => {
      const res = await claude().messages.parse({
        model: MODEL, max_tokens: 12000,
        system: systemFor(evidenceBlock, CORE_TASK),
        thinking: { type: "disabled" },
        output_config: { effort: EFFORT, format: zodOutputFormat(AnalysisCoreSchema) },
        messages: [{ role: "user", content: `${extractionBlock}${issuesFor(["brief30", "most_important", "key_points", "today_action", "action_items", "why_care"])}\n\nWrite part 1 now.` }],
      });
      addUsage(usage, res);
      if (!res.parsed_output) throw new Error("core: failed to parse");
      return res.parsed_output;
    })(),
    (async (): Promise<AnalysisDepth> => {
      const res = await claude().messages.parse({
        model: MODEL, max_tokens: 20000,
        system: systemFor(evidenceBlock, DEPTH_TASK),
        thinking: { type: "disabled" },
        output_config: { effort: EFFORT, format: zodOutputFormat(AnalysisDepthSchema) },
        messages: [{ role: "user", content: `${extractionBlock}${issuesFor(["brief180", "detail"])}\n\nWrite part 2 now.` }],
      });
      addUsage(usage, res);
      if (!res.parsed_output) throw new Error("depth: failed to parse");
      return res.parsed_output;
    })(),
  ]);

  // Part 3: extras — core/depth を踏まえて（反論・図解・引用・未確認）
  const extrasRes = await claude().messages.parse({
    model: MODEL, max_tokens: 12000,
    system: systemFor(evidenceBlock, EXTRAS_TASK),
    thinking: { type: "disabled" }, // structured+thinking はキャッシュ無効化されるため無効化（effortで深度確保）
    output_config: { effort: EFFORT, format: zodOutputFormat(AnalysisExtrasSchema) },
    messages: [{ role: "user", content: `${extractionBlock}\n\n# ALREADY-WRITTEN CORE+DEPTH\n${JSON.stringify({ ...core, ...depth }, null, 1)}${issuesFor(["ai_insight", "diagrams", "quotes", "unverified", "conflicts"])}\n\nWrite part 3 now.` }],
  });
  addUsage(usage, extrasRes);
  if (!extrasRes.parsed_output) throw new Error("extras: failed to parse");
  const extras: AnalysisExtras = extrasRes.parsed_output;

  return { ...core, ...depth, ...extras };
}

/** 可視化パス：要約を構造化ビジュアル（表・2×2・プロセス等）に変換。evidenceキャッシュ共有。 */
export async function generateVisuals(evidenceBlock: string, analysis: Analysis, extraction: Extraction, usage: Usage): Promise<Visuals> {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 12000,
    system: systemFor(evidenceBlock, VISUALS_TASK),
    thinking: { type: "disabled" }, // structured+thinking はキャッシュ無効化されるため無効化（effortで深度確保）
    output_config: { effort: EFFORT, format: zodOutputFormat(VisualsSchema) },
    messages: [{ role: "user", content: `# PASS 1 EXTRACTION\n${JSON.stringify(extraction, null, 1)}\n\n# FINISHED ANALYSIS\n${JSON.stringify(analysis, null, 1)}\n\nProduce the visual blocks now.` }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("visuals: failed to parse");
  return res.parsed_output;
}

export async function checkAnalysis(evidenceBlock: string, analysis: Analysis, usage: Usage): Promise<QA> {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: systemFor(evidenceBlock, QA_TASK),
    thinking: { type: "disabled" }, // structured+thinking はキャッシュ無効化されるため無効化（effortで深度確保）
    output_config: { effort: EFFORT, format: zodOutputFormat(QASchema) },
    messages: [{ role: "user", content: `# ANALYSIS\n${JSON.stringify(analysis, null, 1)}` }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("qa: failed to parse structured output");
  return res.parsed_output;
}
