import Anthropic from "@anthropic-ai/sdk";

// ANTHROPIC_API_KEY を環境（.env.local）から読む。鍵をコードに書かない。
let _client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!_client) _client = new Anthropic({ timeout: 15 * 60 * 1000 });
  return _client;
}

export const MODEL = process.env.BOOKLENS_MODEL ?? "claude-opus-5";
// 要約系の思考深度。全呼び出しで統一することで根拠ブロックのプロンプトキャッシュを共有する（コスト削減の要）。
export const EFFORT = (process.env.BOOKLENS_EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max";

export function hasApiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };
export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
export function addUsage(u: Usage, r: Anthropic.Message | Anthropic.Messages.Message) {
  u.input += r.usage.input_tokens;
  u.output += r.usage.output_tokens;
  u.cacheRead += r.usage.cache_read_input_tokens ?? 0;
  u.cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
}
