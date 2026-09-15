import { getBook, setLibraryStatus, getLibraryStatus } from "@/lib/db";

export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/library">) {
  const { id } = await ctx.params;
  if (!getBook(id)) return Response.json({ error: "not found" }, { status: 404 });
  const { status } = (await req.json()) as { status: string | null };
  const allowed = ["want", "reading", "done", "summary_only", null];
  if (!allowed.includes(status)) return Response.json({ error: "bad status" }, { status: 400 });
  setLibraryStatus(id, status);
  return Response.json({ status: getLibraryStatus(id) });
}
