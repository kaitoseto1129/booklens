import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL, addUsage, type Usage } from "./client";
import { researchInstructions, prefetchedBlock, gapFillInstructions } from "./prompts";
import { SourceListSchema } from "./schemas";
import type { BookFacts, PrefetchedSource } from "../books/types";

const MAX_CONTINUATIONS = 4;

/** Bタイプ：web_search / web_fetch で根拠資料（dossier）を作る。 */
export async function buildDossier(
  facts: BookFacts,
  prefetched: PrefetchedSource[],
  usage: Usage,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const client = claude();
  const lang = facts.language === "jpn" || /[぀-ヿ一-鿿]/.test(facts.title) ? "ja" : "en";
  const userText = `# PRE-FETCHED SOURCES (already verified; cite by ref)\n${prefetchedBlock(prefetched) || "(none)"}\n\nNow research the book and write the dossier.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  const tools = [
    { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 10 },
    { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 8, max_content_tokens: 20000 },
  ];

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: researchInstructions(facts, lang),
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools,
    messages,
  });
  addUsage(usage, response);

  let n = 0;
  while (response.stop_reason === "pause_turn" && n < MAX_CONTINUATIONS) {
    n++;
    onProgress?.(`情報源を追加で調べています（${n}）`);
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: researchInstructions(facts, lang),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools,
      messages,
    });
    addUsage(usage, response);
  }
  if (response.stop_reason === "refusal") throw new Error("research refused: " + (response.stop_details?.explanation ?? ""));

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("research produced no text");

  // 事前取得分は必ず dossier の先頭に含める（モデルが省略しても根拠として残す）
  return `${prefetchedBlock(prefetched)}\n\n---\n\n${text}`;
}

/** dossier から情報源一覧を構造化して取り出す（UIの「情報源」表示・精度スコア用）。 */
export async function extractSourceList(dossier: string, usage: Usage) {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: zodOutputFormat(SourceListSchema) },
    messages: [
      {
        role: "user",
        content: `List every source that appears in this dossier (both pre-fetched S-refs and the SOURCES section). Keep refs as written. Then say whether a table of contents was found.\n\n${dossier.slice(0, 120_000)}`,
      },
    ],
  });
  addUsage(usage, res);
  return res.parsed_output ?? { sources: [], toc_found: false, primary_source_count: 0 };
}

/** 追加調査：目次や一次情報が足りない時に、欠けているものだけを狙って探す。 */
export async function gapFill(facts: BookFacts, dossier: string, missing: string[], nextRef: number, usage: Usage): Promise<string | null> {
  const client = claude();
  const system = gapFillInstructions({ ...facts, nextRef }, missing);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `# EXISTING DOSSIER (for reference; do not repeat)\n${dossier.slice(0, 60_000)}\n\nFind the missing items now.` }];
  const tools = [
    { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6 },
    { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 5, max_content_tokens: 20000 },
  ];
  let res = await client.messages.create({ model: MODEL, max_tokens: 8000, system, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, tools, messages });
  addUsage(usage, res);
  let n = 0;
  while (res.stop_reason === "pause_turn" && n++ < 2) {
    messages.push({ role: "assistant", content: res.content });
    res = await client.messages.create({ model: MODEL, max_tokens: 8000, system, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, tools, messages });
    addUsage(usage, res);
  }
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return text || null;
}
