import type Anthropic from "@anthropic-ai/sdk";
import { getBook, latestAnalysis, listChat, appendChat, clearChat } from "@/lib/db";
import { askStream } from "@/lib/ai/ask";
import { evidenceSystemBlock } from "@/lib/ai/prompts";
import type { BookFacts } from "@/lib/books/types";

export async function POST(req: Request, ctx: RouteContext<"/api/books/[id]/ask">) {
  const { id } = await ctx.params;
  const book = getBook(id);
  const a = latestAnalysis(id);
  if (!book || !a || a.status !== "done" || !a.content || !a.dossier)
    return Response.json({ error: "analysis not ready" }, { status: 409 });
  const { question } = (await req.json()) as { question: string };
  if (!question?.trim()) return Response.json({ error: "question required" }, { status: 400 });

  const facts: BookFacts = {
    title: book.title, subtitle: book.subtitle, originalTitle: book.original_title, authors: JSON.parse(book.authors),
    year: book.published_year, publisher: book.publisher, isbn13: book.isbn13, isbn10: book.isbn10, language: book.language,
    description: book.description, subjects: JSON.parse(book.subjects), toc: null, relatedEditions: [], coverUrl: book.cover_url,
  };
  const evidence = evidenceSystemBlock(facts, a.dossier, (book.source_type ?? "B") as "A" | "B");
  const history: Anthropic.MessageParam[] = listChat(id).slice(-12).map((m) => ({ role: m.role, content: m.content }));
  appendChat(id, "user", question);

  const stream = askStream(evidence, a.content, history, question);
  const encoder = new TextEncoder();
  let full = "";
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            full += ev.delta.text;
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const msg = "\n\n（この質問には回答できませんでした）";
          full += msg;
          controller.enqueue(encoder.encode(msg));
        }
        appendChat(id, "assistant", full);
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[エラー] ${e instanceof Error ? e.message : String(e)}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/books/[id]/ask">) {
  const { id } = await ctx.params;
  return Response.json({ messages: listChat(id) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/books/[id]/ask">) {
  const { id } = await ctx.params;
  clearChat(id);
  return Response.json({ ok: true });
}
