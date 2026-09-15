import { getBook } from "@/lib/db";
import { startAnalysis } from "@/lib/pipeline";

/** 再生成（force）または未生成なら生成開始 */
export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/generate">) {
  const { id } = await ctx.params;
  const book = getBook(id);
  if (!book) return Response.json({ error: "not found" }, { status: 404 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const a = startAnalysis(book, force);
  return Response.json({ analysisId: a.id, status: a.status, version: a.version });
}
