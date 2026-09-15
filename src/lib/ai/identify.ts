import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, MODEL } from "./client";
import type { Candidate } from "../books/types";
import { isbn13to10, amazonCover } from "../books/ndl";

const CandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      authors: z.array(z.string()),
      publisher: z.string().nullable(),
      year: z.number().int().nullable(),
      isbn13: z.string().nullable().describe("978/979で始まる13桁。確認できなければnull"),
      language: z.string().nullable().describe("jpn / eng など"),
      note: z.string().nullable().describe("同名書籍・新版・翻訳版などの補足"),
    }),
  ),
});

/** Open Library / NDL で見つからない時のフォールバック：Web検索で書籍を特定する。 */
export async function identifyWithAI(q: string): Promise<Candidate[]> {
  const client = claude();
  const system = `You identify books from a user's query using web search. Return up to 5 distinct books that best match, preferring the exact title match first, then editions/translations. Prefer publisher pages, national library catalogs (NDL, Library of Congress), Open Library, or major retailers to confirm the ISBN-13. Never invent an ISBN — use null if unconfirmed. Respond with ONLY a JSON object matching: {"candidates":[{"title","subtitle","authors":[],"publisher","year","isbn13","language","note"}]}`;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Query: ${q}` }];
  const tools = [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 4 }];
  let res = await client.messages.create({ model: MODEL, max_tokens: 4000, system, thinking: { type: "adaptive" }, output_config: { effort: "low" }, tools, messages });
  let n = 0;
  while (res.stop_reason === "pause_turn" && n++ < 2) {
    messages.push({ role: "assistant", content: res.content });
    res = await client.messages.create({ model: MODEL, max_tokens: 4000, system, thinking: { type: "adaptive" }, output_config: { effort: "low" }, tools, messages });
  }
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  let parsed: z.infer<typeof CandidatesSchema> | null = null;
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    const r = CandidatesSchema.safeParse(JSON.parse(m[0]));
    if (r.success) parsed = r.data;
  }
  if (!parsed) {
    const p = await client.messages.parse({
      model: MODEL, max_tokens: 4000, thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(CandidatesSchema) },
      messages: [{ role: "user", content: `Extract the book candidates from this text as JSON:\n${text}` }],
    });
    parsed = p.parsed_output ?? { candidates: [] };
  }
  return parsed.candidates.map((c) => {
    const isbn13 = c.isbn13?.replace(/[-\s]/g, "") ?? null;
    const isbn10 = isbn13 && /^\d{13}$/.test(isbn13) ? isbn13to10(isbn13) : null;
    const ja = c.language === "jpn" || /[぀-ヿ一-鿿]/.test(c.title);
    return {
      olWorkKey: null, olEditionKey: null, title: c.title, subtitle: c.subtitle, authors: c.authors, year: c.year,
      isbn13: isbn13 && /^\d{13}$/.test(isbn13) ? isbn13 : null, isbn10,
      coverUrl: isbn10 && ja ? amazonCover(isbn10) : isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false` : null,
      language: c.language ?? (ja ? "jpn" : null), publisher: c.publisher, ebookAccess: null, editionCount: 1, source: "ai" as const, note: c.note,
    };
  });
}
