import { ensureBook, startAnalysis } from "@/lib/pipeline";
import type { Candidate } from "@/lib/books/types";

/** 候補を選択 → books に登録 → 生成開始 */
export async function POST(req: Request) {
  const c = (await req.json()) as Candidate;
  if (!c?.title) return Response.json({ error: "title required" }, { status: 400 });
  const book = await ensureBook(c);
  const analysis = startAnalysis(book);
  return Response.json({ id: book.id, analysisId: analysis.id, status: analysis.status });
}
