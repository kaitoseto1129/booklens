import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL, EFFORT, addUsage, emptyUsage } from "./client";
import { AnswerSchema, type AnswerResult } from "./schemas";

const RESEARCH = `You are a librarian-analyst. The user has a real problem or question (often about work, management, decisions, habits, money, health). Using web_search, find what several respected, well-known books say about it, and where they AGREE. Prefer established books (bestsellers, classics, expert-recommended) over blogs. Collect: the consensus answer across books, which book says what, and 3–5 books most worth reading on this. Note where advice conflicts or depends on context. Keep it grounded in what those books actually argue — do not invent titles or claims.`;

/** 悩み → 複数の本から共通する答え＋根拠の本。 */
export async function answerQuestion(q: string): Promise<{ result: AnswerResult; usage: ReturnType<typeof emptyUsage> }> {
  const usage = emptyUsage();
  const client = claude();
  const tools = [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6 }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `User's question/problem (Japanese):\n${q}\n\nResearch what books say and where they agree.` }];

  let res = await client.messages.create({ model: MODEL, max_tokens: 8000, system: RESEARCH, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, tools, messages });
  addUsage(usage, res);
  let n = 0;
  while (res.stop_reason === "pause_turn" && n++ < 3) {
    messages.push({ role: "assistant", content: res.content });
    res = await client.messages.create({ model: MODEL, max_tokens: 8000, system: RESEARCH, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, tools, messages });
    addUsage(usage, res);
  }
  const findings = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");

  // 構造化（日本語・結論ファースト）
  const parsed = await client.messages.parse({
    model: MODEL, max_tokens: 6000, thinking: { type: "disabled" },
    output_config: { effort: EFFORT, format: zodOutputFormat(AnswerSchema) },
    system: "以下の調査メモから、ユーザーの悩みに対する『複数の本に共通する答え』を結論ファーストで日本語にまとめる。本に実際にある主張のみ。合意度の高い順。",
    messages: [{ role: "user", content: `# 悩み\n${q}\n\n# 調査メモ\n${findings}` }],
  });
  addUsage(usage, parsed);
  if (!parsed.parsed_output) throw new Error("answer: failed to parse");
  return { result: parsed.parsed_output, usage };
}
