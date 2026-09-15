import { getBook, insertReport } from "@/lib/db";

export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/report">) {
  const { id } = await ctx.params;
  if (!getBook(id)) return Response.json({ error: "not found" }, { status: 404 });
  const { section, correct, comment } = (await req.json()) as { section: string; correct: string; comment: string };
  insertReport(id, section ?? "", correct ?? "", comment ?? "");
  return Response.json({ ok: true });
}
