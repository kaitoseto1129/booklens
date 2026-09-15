import { getJson, isIsbn, normIsbn } from "./http";
import type { Candidate } from "./types";

type OLDoc = {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  cover_edition_key?: string;
  language?: string[];
  publisher?: string[];
  edition_count?: number;
  ebook_access?: string;
  edition_key?: string[];
};

const FIELDS =
  "key,title,subtitle,author_name,first_publish_year,isbn,cover_i,cover_edition_key,language,publisher,edition_count,ebook_access,edition_key";

export async function searchOpenLibrary(q: string, limit = 8): Promise<Candidate[]> {
  const params = new URLSearchParams({ fields: FIELDS, limit: String(limit) });
  if (isIsbn(q)) params.set("isbn", normIsbn(q));
  else params.set("q", q);
  const data = await getJson<{ docs: OLDoc[] }>(`https://openlibrary.org/search.json?${params}`);
  if (!data?.docs) return [];
  const wantsJa = /[\u3040-\u30ff\u4e00-\u9fff]/.test(q);
  return data.docs.map((d) => {
    const isbns = d.isbn ?? [];
    // 検索結果の isbn/language は全版をまとめたものなので、単一版のときだけ確定値として扱う
    const single = (d.edition_count ?? 0) <= 1;
    const isbn13 = single ? isbns.find((x) => x.length === 13) ?? null : null;
    const isbn10 = single ? isbns.find((x) => x.length === 10) ?? null : null;
    const langs = d.language ?? [];
    const language = wantsJa && langs.includes("jpn") ? "jpn" : langs.includes("eng") ? "eng" : langs[0] ?? null;
    return {
      olWorkKey: d.key,
      olEditionKey: d.cover_edition_key ?? d.edition_key?.[0] ?? null,
      title: d.title,
      subtitle: d.subtitle ?? null,
      authors: d.author_name ?? [],
      year: d.first_publish_year ?? null,
      isbn13,
      isbn10,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      language,
      publisher: single ? d.publisher?.[0] ?? null : null,
      ebookAccess: d.ebook_access ?? null,
      editionCount: d.edition_count ?? 0,
      source: "openlibrary" as const,
    };
  });
}

type OLWork = {
  title?: string;
  subtitle?: string;
  description?: string | { value: string };
  subjects?: string[];
  covers?: number[];
  authors?: { author: { key: string } }[];
  first_publish_date?: string;
};

type OLEdition = {
  key: string;
  title?: string;
  subtitle?: string;
  publishers?: string[];
  publish_date?: string;
  languages?: { key: string }[];
  isbn_13?: string[];
  isbn_10?: string[];
  table_of_contents?: { title?: string; label?: string; level?: number }[];
  translation_of?: string;
  translated_from?: { key: string }[];
  number_of_pages?: number;
  ocaid?: string;
  covers?: number[];
};

const descText = (d: OLWork["description"]) => (typeof d === "string" ? d : d?.value ?? null);

export async function fetchWork(workKey: string) {
  const w = await getJson<OLWork>(`https://openlibrary.org${workKey}.json`);
  if (!w) return null;
  return {
    title: w.title ?? null,
    subtitle: w.subtitle ?? null,
    description: descText(w.description),
    subjects: (w.subjects ?? []).slice(0, 20),
    coverUrl: w.covers?.[0] ? `https://covers.openlibrary.org/b/id/${w.covers[0]}-L.jpg` : null,
    authorKeys: (w.authors ?? []).map((a) => a.author?.key).filter(Boolean) as string[],
  };
}

export async function fetchAuthor(authorKey: string) {
  const a = await getJson<{ name?: string; bio?: string | { value: string }; links?: { url: string; title?: string }[]; wikipedia?: string }>(
    `https://openlibrary.org${authorKey}.json`,
  );
  if (!a) return null;
  return {
    name: a.name ?? null,
    bio: descText(a.bio),
    links: (a.links ?? []).map((l) => ({ url: l.url, title: l.title ?? null })),
    wikipedia: a.wikipedia ?? null,
  };
}

export type EditionInfo = {
  key: string;
  title: string | null;
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  year: number | null;
  toc: string[] | null;
  translationOf: string | null;
  ocaid: string | null;
  pages: number | null;
};

function toEdition(e: OLEdition): EditionInfo {
  const yearMatch = e.publish_date?.match(/\d{4}/);
  const toc = (e.table_of_contents ?? [])
    .map((t) => (t.title ?? t.label ?? "").trim())
    .filter((t) => t.length > 0);
  return {
    key: e.key,
    title: e.title ?? null,
    language: e.languages?.[0]?.key?.replace("/languages/", "") ?? null,
    isbn13: e.isbn_13?.[0] ?? null,
    isbn10: e.isbn_10?.[0] ?? null,
    publisher: e.publishers?.[0] ?? null,
    year: yearMatch ? Number(yearMatch[0]) : null,
    toc: toc.length > 0 ? toc : null,
    translationOf: e.translation_of ?? null,
    ocaid: e.ocaid ?? null,
    pages: e.number_of_pages ?? null,
  };
}

export async function fetchEdition(editionKey: string): Promise<EditionInfo | null> {
  const e = await getJson<OLEdition>(`https://openlibrary.org/books/${editionKey}.json`);
  return e ? toEdition(e) : null;
}

export async function fetchEditions(workKey: string, limit = 60): Promise<EditionInfo[]> {
  const data = await getJson<{ entries: OLEdition[] }>(`https://openlibrary.org${workKey}/editions.json?limit=${limit}`);
  return (data?.entries ?? []).map(toEdition);
}

/** ISBN から Open Library の work / edition キーを引く（NDL・AI経由の本を OL に紐付ける） */
export async function lookupByIsbn(isbn: string): Promise<{ workKey: string | null; editionKey: string | null; coverUrl: string | null } | null> {
  const e = await getJson<{ key: string; works?: { key: string }[]; covers?: number[] }>(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!e) return null;
  return {
    workKey: e.works?.[0]?.key ?? null,
    editionKey: e.key?.replace("/books/", "") ?? null,
    coverUrl: e.covers?.[0] ? `https://covers.openlibrary.org/b/id/${e.covers[0]}-L.jpg` : null,
  };
}
