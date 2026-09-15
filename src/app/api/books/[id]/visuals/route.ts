import { getBook, latestAnalysis, updateAnalysis } from "@/lib/db";
import { generateVisuals } from "@/lib/ai/summarize";
import { evidenceSystemBlock } from "@/lib/ai/prompts";
import { emptyUsage } from "@/lib/ai/client";
import type { BookFacts } from "@/lib/books/types";
import type { Analysis, Extraction } from "@/lib/ai/schemas";

/** 既存の完了要約に対して、可視化だけを（再）生成する。フル再生成より安い。 */
export async function POST(_req: Request, ctx: RouteContext<"/api/books/[id]/visuals">) {
  const { id } = await ctx.params;
  const book = getBook(id);
  const a = latestAnalysis(id);
  if (!book || !a || a.status !== "done" || !a.content || !a.dossier || !a.extraction)
    return Response.json({ error: "analysis not ready" }, { status: 409 });

  const facts: BookFacts = {
    title: book.title, subtitle: book.subtitle, originalTitle: book.original_title, authors: JSON.parse(book.authors),
    year: book.published_year, publisher: book.publisher, isbn13: book.isbn13, isbn10: book.isbn10, language: book.language,
    description: book.description, subjects: JSON.parse(book.subjects), toc: null, relatedEditions: [], coverUrl: book.cover_url,
  };
  const evidence = evidenceSystemBlock(facts, a.dossier, (book.source_type ?? "B") as "A" | "B");
  const usage = emptyUsage();
  try {
    const visuals = await generateVisuals(evidence, JSON.parse(a.content) as Analysis, JSON.parse(a.extraction) as Extraction, usage);
    updateAnalysis(a.id, { visuals: JSON.stringify(visuals) });
    return Response.json({ count: visuals.visuals.length, usage });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
