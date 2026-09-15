import type { NextRequest } from "next/server";
import { loadBook } from "@/lib/bookEvidence";
import { generateVideo } from "@/lib/ai/features";
import { buildVideoScenes } from "@/lib/video";
import { hasApiKey } from "@/lib/ai/client";
import { updateAnalysis } from "@/lib/db";

/**
 * ?length=5|10|20&mode=auto|ai|derived
 * - auto（既定）: キャッシュ済みAI動画があれば即返す。無ければAI生成→保存。AI不可なら導出版。
 * - ai: 常にAI生成して保存（作り直し）。
 * - derived: 既存要約から即時構築（無料・低コスト）。
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/books/[id]/video">) {
  const { id } = await ctx.params;
  const length = ([5, 10, 20].includes(Number(req.nextUrl.searchParams.get("length"))) ? Number(req.nextUrl.searchParams.get("length")) : 10) as 5 | 10 | 20;
  const mode = req.nextUrl.searchParams.get("mode") ?? "auto";
  const lb = loadBook(id);
  if (!lb) return Response.json({ error: "要約が未完了です" }, { status: 409 });

  const cache = lb.analysis.videos ? (JSON.parse(lb.analysis.videos) as Record<string, unknown[]>) : {};

  const derived = () => {
    const visuals = lb.analysis.visuals ? JSON.parse(lb.analysis.visuals).visuals : null;
    return buildVideoScenes(lb.content, visuals, length, lb.book.title, JSON.parse(lb.book.authors).join(", "));
  };

  if (mode === "derived") return Response.json({ scenes: derived(), length, ai: false });

  // auto: キャッシュ優先
  if (mode === "auto" && cache[String(length)]) return Response.json({ scenes: cache[String(length)], length, ai: true, cached: true });

  // AI生成（auto でキャッシュ無し、または ai 指定）
  if (!hasApiKey()) return Response.json({ scenes: derived(), length, ai: false });
  try {
    const v = await generateVideo(lb.evidence, lb.content, length);
    cache[String(length)] = v.scenes;
    updateAnalysis(lb.analysis.id, { videos: JSON.stringify(cache) });
    return Response.json({ scenes: v.scenes, length, ai: true });
  } catch (e) {
    // 失敗時は導出版にフォールバック
    console.warn("[video] AI failed, fallback derived", e);
    return Response.json({ scenes: derived(), length, ai: false, fallback: String(e instanceof Error ? e.message : e) });
  }
}
