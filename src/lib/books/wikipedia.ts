import { getJson } from "./http";

type SearchRes = { query?: { search?: { title: string; pageid: number; snippet: string }[] } };
type ExtractRes = { query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> } };

/** Wikipedia REST summary からページ画像（サムネ）を取得。CCライセンス、無ければ null。 */
export async function fetchWikiImage(lang: "en" | "ja", title: string): Promise<string | null> {
  const res = await getJson<{ thumbnail?: { source: string }; originalimage?: { source: string } }>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    10000,
  );
  const src = res?.originalimage?.source ?? res?.thumbnail?.source ?? null;
  // utm クエリを外して安定URLに
  return src ? src.split("?")[0] : null;
}

async function pageExtract(lang: "en" | "ja", title: string, maxChars: number) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts|info",
    inprop: "url",
    explaintext: "1",
    titles: title,
    format: "json",
    redirects: "1",
  });
  const res = await getJson<ExtractRes>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  const page = Object.values(res?.query?.pages ?? {})[0];
  if (!page?.extract) return null;
  return { title: page.title, url: page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`, text: page.extract.slice(0, maxChars) };
}

/** 書籍ページ（見つかれば）と著者ページを返す。書籍ページは題名一致 or 本文に書名+著者が現れる場合のみ採用。 */
export async function fetchWikipedia(title: string, author: string | null, langs: ("en" | "ja")[] = ["en", "ja"]) {
  const out: { kind: "book" | "author"; lang: string; title: string; url: string; text: string; image: string | null }[] = [];
  const t = title.toLowerCase();
  for (const lang of langs) {
    const q = author ? `${title} ${author}` : title;
    const params = new URLSearchParams({ action: "query", list: "search", srsearch: q, format: "json", srlimit: "5" });
    const res = await getJson<SearchRes>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    const hits = res?.query?.search ?? [];
    let bookFound = false;
    for (const h of hits) {
      const ht = h.title.toLowerCase();
      if (!bookFound && (ht === t || ht.startsWith(t + " (") || ht.includes(t))) {
        const p = await pageExtract(lang, h.title, 7000);
        if (p && (!author || p.text.toLowerCase().includes(author.split(" ").pop()!.toLowerCase()))) {
          out.push({ kind: "book", lang, ...p, image: await fetchWikiImage(lang, h.title) });
          bookFound = true;
        }
      }
    }
    if (author) {
      const a = hits.find((h) => h.title.toLowerCase() === author.toLowerCase());
      if (a) {
        const p = await pageExtract(lang, a.title, 3000);
        if (p) out.push({ kind: "author", lang, ...p, image: await fetchWikiImage(lang, a.title) });
      }
    }
  }
  return out;
}
