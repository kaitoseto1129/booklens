import type { NextRequest } from "next/server";
import { answerQuestion } from "@/lib/ai/answer";
import { hasApiKey } from "@/lib/ai/client";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 4) return Response.json({ error: "質問をもう少し具体的に入力してください" }, { status: 400 });
  if (!hasApiKey()) return Response.json({ error: "ANTHROPIC_API_KEY が未設定です" }, { status: 500 });
  try {
    const { result } = await answerQuestion(q);
    return Response.json({ result });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
