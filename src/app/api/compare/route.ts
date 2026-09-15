import type { NextRequest } from "next/server";
import { loadBook } from "@/lib/bookEvidence";
import { compareBooks } from "@/lib/ai/features";
import { hasApiKey } from "@/lib/ai/client";

export async function GET(req: NextRequest) {
  if (!hasApiKey()) return Response.json({ error: "APIキー未設定" }, { status: 500 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (ids.length < 2) return Response.json({ error: "2冊以上を指定してください" }, { status: 400 });
  const loaded = ids.map(loadBook);
  if (loaded.some((l) => !l)) return Response.json({ error: "要約が未完了の本があります" }, { status: 409 });
  const items = loaded.filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => ({ title: l.book.title, evidence: l.evidence, analysis: l.content }));
  try {
    return Response.json({ result: await compareBooks(items), titles: items.map((i) => i.title) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
