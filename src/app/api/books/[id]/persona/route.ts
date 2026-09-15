import { loadBook } from "@/lib/bookEvidence";
import { personaSummary } from "@/lib/ai/features";
import { hasApiKey } from "@/lib/ai/client";

export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/persona">) {
  const { id } = await ctx.params;
  if (!hasApiKey()) return Response.json({ error: "APIキー未設定" }, { status: 500 });
  const lb = loadBook(id);
  if (!lb) return Response.json({ error: "要約が未完了です" }, { status: 409 });
  const { persona } = (await req.json()) as { persona: string };
  if (!persona) return Response.json({ error: "persona required" }, { status: 400 });
  try {
    return Response.json({ result: await personaSummary(lb.evidence, lb.content, persona) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
