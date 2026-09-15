import { getBook, latestAnalysis, listSources, type TimelineEntry } from "@/lib/db";
import { estimateRemaining, estimateTotalSeconds } from "@/lib/eta";

export async function GET(_req: Request, ctx: RouteContext<"/api/books/[id]/status">) {
  const { id } = await ctx.params;
  const book = getBook(id);
  if (!book) return Response.json({ error: "not found" }, { status: 404 });
  const a = latestAnalysis(id);
  const timeline = a?.timeline ? (JSON.parse(a.timeline) as TimelineEntry[]) : null;
  const eta = a && (a.status === "running" || a.status === "pending") ? estimateRemaining(timeline, a.started_at) : null;
  return Response.json({
    estimate_total_seconds: estimateTotalSeconds(),
    eta,
    book: { ...book, authors: JSON.parse(book.authors), subjects: JSON.parse(book.subjects) },
    analysis: a
      ? {
          id: a.id,
          version: a.version,
          status: a.status,
          step: a.step,
          step_label: a.step_label,
          progress: a.progress,
          quick: a.quick ? JSON.parse(a.quick) : null,
          content: a.content ? JSON.parse(a.content) : null,
          visuals: a.visuals ? JSON.parse(a.visuals).visuals : null,
          confidence: a.confidence ? JSON.parse(a.confidence) : null,
          qa: a.qa ? JSON.parse(a.qa) : null,
          error: a.error,
          usage: a.usage ? JSON.parse(a.usage) : null,
          timeline,
          started_at: a.started_at,
          updated_at: a.updated_at,
        }
      : null,
    sources: a?.status === "done" ? listSources(id) : [],
  });
}
