import type { NextRequest } from "next/server";
import { loadBook } from "@/lib/bookEvidence";
import { generateVideo } from "@/lib/ai/features";
import { buildVideoScenes } from "@/lib/video";
import { hasApiKey } from "@/lib/ai/client";
import { updateAnalysis, getAnalysis } from "@/lib/db";

// AI動画は重い（約2分）。同期リクエストだと本番でタイムアウト(502)しやすいので、
// バックグラウンドで生成し、クライアントは短いポーリングで受け取る。
const jobs = new Map<string, Promise<void>>();
const failed = new Map<string, number>();

/**
 * ?length=5|10|20&mode=auto|ai|derived
 * - derived: 既存要約から即時構築（無料・低コスト）。
 * - auto（既定）: キャッシュ済みAI動画があれば即返す。無ければ裏で生成開始し {status:"generating"} を返す。
 * - ai: 常に作り直し（裏で生成）。
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/books/[id]/video">) {
  const { id } = await ctx.params;
  const length = ([5, 10, 20].includes(Number(req.nextUrl.searchParams.get("length"))) ? Number(req.nextUrl.searchParams.get("length")) : 10) as 5 | 10 | 20;
  const mode = req.nextUrl.searchParams.get("mode") ?? "auto";
  const lb = loadBook(id);
  if (!lb) return Response.json({ error: "要約が未完了です" }, { status: 409 });

  const analysisId = lb.analysis.id;
  const key = `${id}:${length}`;
  const readCache = (): Record<string, unknown[]> => {
    const row = getAnalysis(analysisId);
    return row?.videos ? (JSON.parse(row.videos) as Record<string, unknown[]>) : {};
  };

  const derived = () => {
    const visuals = lb.analysis.visuals ? JSON.parse(lb.analysis.visuals).visuals : null;
    return buildVideoScenes(lb.content, visuals, length, lb.book.title, JSON.parse(lb.book.authors).join(", "));
  };

  if (mode === "derived") return Response.json({ scenes: derived(), length, ai: false, ready: true });

  const cache = readCache();
  if (mode !== "ai" && cache[String(length)]) return Response.json({ scenes: cache[String(length)], length, ai: true, cached: true, ready: true });

  // AIが使えない環境では導出版で代替
  if (!hasApiKey()) return Response.json({ scenes: derived(), length, ai: false, ready: true });

  // 直近で失敗したら導出版にフォールバック（無限ポーリング防止）
  const f = failed.get(key);
  if (f && Date.now() - f < 60_000) return Response.json({ scenes: derived(), length, ai: false, fallback: true, ready: true });

  // まだ生成していなければ、バックグラウンドで開始
  if (!jobs.has(key)) {
    const p = (async () => {
      try {
        const v = await generateVideo(lb.evidence, lb.content, length);
        const c = readCache();
        c[String(length)] = v.scenes;
        updateAnalysis(analysisId, { videos: JSON.stringify(c) });
        failed.delete(key);
      } catch (e) {
        console.warn("[video] AI failed", e);
        failed.set(key, Date.now());
      } finally {
        jobs.delete(key);
      }
    })();
    jobs.set(key, p);
  }

  // 生成中：クライアントはポーリングで再取得する
  return Response.json({ status: "generating", ready: false, length }, { status: 202 });
}
