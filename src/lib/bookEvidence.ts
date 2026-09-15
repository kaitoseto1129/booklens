import { getBook, latestAnalysis, type BookRow, type AnalysisRow } from "./db";
import { evidenceSystemBlock } from "./ai/prompts";
import type { BookFacts } from "./books/types";
import type { Analysis } from "./ai/schemas";

export type LoadedBook = { book: BookRow; analysis: AnalysisRow; content: Analysis; evidence: string };

/** 本＋完了要約を読み込み、根拠ブロックを組み立てる（各AI機能で共用）。 */
export function loadBook(id: string): LoadedBook | null {
  const book = getBook(id);
  const a = latestAnalysis(id);
  if (!book || !a || a.status !== "done" || !a.content || !a.dossier) return null;
  const facts: BookFacts = {
    title: book.title, subtitle: book.subtitle, originalTitle: book.original_title, authors: JSON.parse(book.authors),
    year: book.published_year, publisher: book.publisher, isbn13: book.isbn13, isbn10: book.isbn10, language: book.language,
    description: book.description, subjects: JSON.parse(book.subjects), toc: null, relatedEditions: [], coverUrl: book.cover_url,
  };
  return { book, analysis: a, content: JSON.parse(a.content) as Analysis, evidence: evidenceSystemBlock(facts, a.dossier, (book.source_type ?? "B") as "A" | "B") };
}
