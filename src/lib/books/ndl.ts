import { getText, isIsbn, normIsbn } from "./http";
import type { Candidate } from "./types";

/** 国立国会図書館サーチ OpenSearch（RSS）。日本の書籍の書誌情報源。 */

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : null;
};
const tags = (xml: string, name: string) => {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decode(m[1].trim()));
  return out;
};
const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** 表記ゆれ吸収：全角/半角・空白・中黒・記号を落とし、ひらがな→カタカナ */
export function normJa(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･·:：\-‐–—―!！?？「」『』（）()\[\]【】,，.。、~〜]/g, "")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** "西口, 一希" → "西口一希"、"Duke, Annie, 1965-" → "Annie Duke" */
function cleanCreator(c: string) {
  const s = c.replace(/,?\s*\d{4}-(\d{4})?$/, "").replace(/\s*(著|訳|編|監修|編著|共著)\s*$/, "").trim();
  const parts = s.split(/,\s*/);
  if (parts.length === 2) {
    const [a, b] = parts;
    return /[぀-ヿ一-鿿]/.test(a + b) ? `${a}${b}` : `${b} ${a}`;
  }
  return s;
}

export type NdlRecord = {
  title: string;
  subtitle: string | null;
  creators: string[];
  publisher: string | null;
  year: number | null;
  isbn13: string | null;
  isbn10: string | null;
  series: string | null;
  subjects: string[];
  link: string | null;
  pages: string | null;
};

function parseItems(xml: string): NdlRecord[] {
  return tags(xml, "item").map((it) => {
    const rawTitle = tag(it, "dc:title") ?? tag(it, "title") ?? "";
    const [t, ...rest] = rawTitle.split(/\s*:\s*/);
    const isbns = tags(it, "dc:identifier")
      .concat(
        (it.match(/<dc:identifier xsi:type="dcndl:ISBN(?:13)?">([^<]+)<\/dc:identifier>/g) ?? []).map((m) => m.replace(/<[^>]+>/g, "")),
      )
      .map((x) => x.replace(/[-\s]/g, ""))
      .filter((x) => /^(97[89])?\d{9}[\dX]$/.test(x));
    const year = tag(it, "dc:date")?.match(/\d{4}/)?.[0];
    const creators = Array.from(new Set(tags(it, "dc:creator").map(cleanCreator))).filter(Boolean);
    return {
      title: t.trim(),
      subtitle: rest.length ? rest.join("：").trim() : null,
      creators,
      publisher: tag(it, "dc:publisher"),
      year: year ? Number(year) : null,
      isbn13: isbns.find((x) => x.length === 13) ?? null,
      isbn10: isbns.find((x) => x.length === 10) ?? null,
      series: tag(it, "dcndl:seriesTitle"),
      subjects: tags(it, "dc:subject").filter((s) => !/^[A-Z]{1,3}\d|^\d{3}/.test(s)),
      link: tag(it, "guid") ?? tag(it, "link"),
      pages: tag(it, "dc:extent"),
    };
  });
}

/** Amazon の ISBN-10 画像パターン（日本の本の表紙フォールバック） */
export function isbn13to10(isbn13: string): string | null {
  if (!/^978\d{10}$/.test(isbn13)) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}
export const amazonCover = (isbn10: string) => `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.09.LZZZZZZZ.jpg`;

export async function searchNdl(q: string, limit = 8): Promise<Candidate[]> {
  const params = new URLSearchParams({ cnt: "25", mediatype: "books", dpid: "iss-ndl-opac" });
  const byIsbn = isIsbn(q);
  if (byIsbn) params.set("isbn", normIsbn(q));
  else params.set("title", q);
  const xml = await getText(`https://ndlsearch.ndl.go.jp/api/opensearch?${params}`, 20000);
  if (!xml) return [];
  const nq = normJa(q);
  const recs = parseItems(xml)
    // NDLは読みの部分一致で大量に返すので、題名（副題含む）に検索語が含まれるものだけ採用
    .filter((r) => byIsbn || normJa(`${r.title}${r.subtitle ?? ""}`).includes(nq))
    .filter((r) => r.isbn13 || r.isbn10);
  // 同一ISBN・同一題名+著者は新しい方を残す
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of recs.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))) {
    const key = r.isbn13 ?? `${normJa(r.title)}|${r.creators[0] ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const isbn10 = r.isbn10 ?? (r.isbn13 ? isbn13to10(r.isbn13) : null);
    out.push({
      olWorkKey: null,
      olEditionKey: null,
      title: r.title,
      subtitle: r.subtitle,
      authors: r.creators,
      year: r.year,
      isbn13: r.isbn13,
      isbn10,
      coverUrl: isbn10 ? amazonCover(isbn10) : null,
      language: "jpn",
      publisher: r.publisher,
      ebookAccess: null,
      editionCount: 1,
      source: "ndl",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchNdlByIsbn(isbn13: string): Promise<NdlRecord | null> {
  const params = new URLSearchParams({ isbn: isbn13, cnt: "3", mediatype: "books", dpid: "iss-ndl-opac" });
  const xml = await getText(`https://ndlsearch.ndl.go.jp/api/opensearch?${params}`, 20000);
  return xml ? parseItems(xml)[0] ?? null : null;
}
