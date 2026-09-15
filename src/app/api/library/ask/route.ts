import { listLibrary, latestAnalysis } from "@/lib/db";
import { askLibrary } from "@/lib/ai/features";
import { hasApiKey } from "@/lib/ai/client";
import type { Analysis } from "@/lib/ai/schemas";

export async function POST(req: Request) {
  if (!hasApiKey()) return Response.json({ error: "APIキー未設定" }, { status: 500 });
  const { question } = (await req.json()) as { question: string };
  if (!question?.trim()) return Response.json({ error: "質問を入力してください" }, { status: 400 });
  const books = listLibrary()
    .map((b) => { const a = latestAnalysis(b.id); return a?.content ? { title: b.title, analysis: JSON.parse(a.content) as Analysis } : null; })
    .filter((b): b is { title: string; analysis: Analysis } => Boolean(b));
  if (books.length === 0) return Response.json({ error: "ライブラリに要約済みの本がありません" }, { status: 409 });
  try {
    return Response.json({ result: await askLibrary(question, books), count: books.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
