import type { NextRequest } from "next/server";
import { identifyWithAI } from "@/lib/ai/identify";
import { hasApiKey } from "@/lib/ai/client";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ candidates: [] });
  if (!hasApiKey()) return Response.json({ error: "ANTHROPIC_API_KEY が設定されていません" }, { status: 500 });
  try {
    return Response.json({ candidates: await identifyWithAI(q) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
