import { getJson, getText } from "./http";

type GBook = {
  id: number;
  title: string;
  authors: { name: string }[];
  languages: string[];
  formats: Record<string, string>;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9぀-ヿ一-鿿]+/g, " ").trim();

/**
 * Aタイプ判定用：Project Gutenberg（パブリックドメイン）に本文があれば取得する。
 * 著者姓が一致し、題名がほぼ一致するものだけ採用する。
 */
export async function fetchGutenbergFullText(title: string, author: string | null, maxChars = 600_000) {
  const params = new URLSearchParams({ search: `${title} ${author ?? ""}`.trim() });
  const res = await getJson<{ results: GBook[] }>(`https://gutendex.com/books?${params}`, 20000);
  const t = norm(title);
  const lastName = author ? norm(author).split(" ").pop() ?? "" : "";
  const hit = (res?.results ?? []).find((b) => {
    const bt = norm(b.title);
    const titleOk = bt === t || bt.startsWith(t) || t.startsWith(bt);
    const authorOk = !lastName || b.authors.some((a) => norm(a.name).includes(lastName));
    return titleOk && authorOk;
  });
  if (!hit) return null;
  const url =
    hit.formats["text/plain; charset=utf-8"] ?? hit.formats["text/plain; charset=us-ascii"] ?? hit.formats["text/plain"] ?? null;
  if (!url) return null;
  const text = await getText(url, 60000, 4_000_000);
  if (!text) return null;
  // Gutenbergのヘッダ/フッタを落とす
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const body = text.slice(start >= 0 ? text.indexOf("\n", start) + 1 : 0, end >= 0 ? end : undefined).trim();
  return { id: hit.id, url: `https://www.gutenberg.org/ebooks/${hit.id}`, text: body.slice(0, maxChars), truncated: body.length > maxChars };
}
