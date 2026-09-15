import { searchOpenLibrary } from "./openlibrary";
import { searchNdl, normJa } from "./ndl";
import { findBookByKeys } from "../db";
import type { Candidate } from "./types";

const hasJa = (s: string) => /[぀-ヿ一-鿿]/.test(s);

// 直近クエリの簡易キャッシュ（プロセス内・5分）。同じ入力の再検索を即返す。
const cache = new Map<string, { at: number; data: Candidate[] }>();
const TTL = 5 * 60 * 1000;

/** 遅いソースが全体を止めないよう、各ソースに短いタイムアウトを付ける。 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

/** Open Library（世界）＋ 国会図書館（日本）を並列検索してマージ。日本語クエリは NDL を優先。 */
export async function searchBooks(q: string, limit = 8): Promise<Candidate[]> {
  const key = `${q.toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const ja = hasJa(q);
  const [ol, ndl] = await Promise.all([
    withTimeout(searchOpenLibrary(q, limit).catch(() => [] as Candidate[]), 3500, [] as Candidate[]),
    withTimeout(searchNdl(q, limit).catch(() => [] as Candidate[]), 3500, [] as Candidate[]),
  ]);
  const ordered = ja ? [...ndl, ...ol] : [...ol, ...ndl];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of ordered) {
    const dedupKey = c.isbn13 ?? `${normJa(c.title)}|${normJa(c.authors[0] ?? "")}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push({ ...c, cached: Boolean(findBookByKeys({ isbn13: c.isbn13, olWorkKey: c.olWorkKey })) });
    if (out.length >= limit) break;
  }
  cache.set(key, { at: Date.now(), data: out });
  return out;
}
