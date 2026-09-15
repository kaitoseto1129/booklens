import { loadBook } from "@/lib/bookEvidence";
import { makeQuiz } from "@/lib/ai/features";
import { hasApiKey } from "@/lib/ai/client";

export async function POST(_req: Request, ctx: RouteContext<"/api/books/[id]/quiz">) {
  const { id } = await ctx.params;
  if (!hasApiKey()) return Response.json({ error: "APIキー未設定" }, { status: 500 });
  const lb = loadBook(id);
  if (!lb) return Response.json({ error: "要約が未完了です" }, { status: 409 });
  try {
    return Response.json({ result: await makeQuiz(lb.evidence, lb.content) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
