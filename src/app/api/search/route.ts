import type { NextRequest } from "next/server";
import { searchOpenLibrary } from "@/lib/books/openlibrary";
import { searchNdl } from "@/lib/books/ndl";
import { findBookByKeys } from "@/lib/db";
import type { Candidate } from "@/lib/books/types";

const mark = (list: Candidate[]) => list.map((c) => ({ ...c, cached: Boolean(findBookByKeys({ isbn13: c.isbn13, olWorkKey: c.olWorkKey })) }));

/** src=ol|ndl で単一ソースだけ返す（クライアントが並列に叩いて、返った順に表示）。指定なしは両方。 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const src = req.nextUrl.searchParams.get("src");
  if (q.length < 2) return Response.json({ candidates: [] });
  try {
    if (src === "ol") return Response.json({ candidates: mark(await searchOpenLibrary(q, 8)) });
    if (src === "ndl") return Response.json({ candidates: mark(await searchNdl(q, 8)) });
    const { searchBooks } = await import("@/lib/books/search");
    return Response.json({ candidates: await searchBooks(q, 8) });
  } catch {
    return Response.json({ candidates: [] });
  }
}
