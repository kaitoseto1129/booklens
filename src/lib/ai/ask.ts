import Anthropic from "@anthropic-ai/sdk";
import { claude, MODEL } from "./client";
import { ASK_TASK, GROUNDING_RULES } from "./prompts";

/** 書籍Q&A：根拠ブロック＋要約をキャッシュしつつ、テキストを逐次返す。 */
export function askStream(evidenceBlock: string, analysisJson: string, history: Anthropic.MessageParam[], question: string) {
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: evidenceBlock, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: `# CURRENT ANALYSIS (already shown to the user)\n${analysisJson}`, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: `${GROUNDING_RULES}\n\n${ASK_TASK}` },
  ];
  return claude().messages.stream({
    model: MODEL,
    max_tokens: 6000,
    system,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: [...history, { role: "user", content: question }],
  });
}
