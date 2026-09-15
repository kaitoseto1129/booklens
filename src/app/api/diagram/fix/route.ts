import { claude, MODEL, hasApiKey } from "@/lib/ai/client";

/** ブラウザで描画に失敗した Mermaid を、エラーメッセージ付きで修復する（1回だけ呼ぶ） */
export async function POST(req: Request) {
  if (!hasApiKey()) return Response.json({ error: "no api key" }, { status: 500 });
  const { code, error } = (await req.json()) as { code: string; error: string };
  if (!code) return Response.json({ error: "code required" }, { status: 400 });
  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system:
      "You fix Mermaid diagrams that failed to render. Keep the meaning and labels; only fix syntax. Rules: use flowchart TD/LR or mindmap; wrap every node label in double quotes; no HTML; no semicolons or parentheses inside unquoted text; at most 12 nodes. Respond with ONLY the corrected Mermaid code, no fences, no commentary.",
    messages: [{ role: "user", content: `Render error:\n${error}\n\nMermaid:\n${code}` }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").replace(/```(mermaid)?/g, "").trim();
  return Response.json({ code: text });
}
