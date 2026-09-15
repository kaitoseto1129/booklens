import { getJson } from "./http";

type Volume = {
  id: string;
  volumeInfo: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    previewLink?: string;
    infoLink?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string };
  };
  searchInfo?: { textSnippet?: string };
  accessInfo?: { viewability?: string; publicDomain?: boolean };
};

/** 任意ソース：GOOGLE_BOOKS_API_KEY がある時だけ使う（鍵なしは日次クォータをすぐ使い切る）。 */
export async function fetchGoogleBooks(opts: { isbn13?: string | null; title: string; author?: string | null }) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return null;
  const q = opts.isbn13 ? `isbn:${opts.isbn13}` : `intitle:"${opts.title}"${opts.author ? `+inauthor:"${opts.author}"` : ""}`;
  const params = new URLSearchParams({ q, maxResults: "3", key });
  const res = await getJson<{ items?: Volume[] }>(`https://www.googleapis.com/books/v1/volumes?${params}`);
  const v = res?.items?.[0];
  if (!v) return null;
  const vi = v.volumeInfo;
  return {
    id: v.id,
    title: vi.title ?? null,
    subtitle: vi.subtitle ?? null,
    authors: vi.authors ?? [],
    publisher: vi.publisher ?? null,
    year: vi.publishedDate ? Number(vi.publishedDate.slice(0, 4)) : null,
    description: vi.description ?? null,
    pageCount: vi.pageCount ?? null,
    categories: vi.categories ?? [],
    language: vi.language ?? null,
    previewLink: vi.previewLink ?? null,
    infoLink: vi.infoLink ?? null,
    snippet: v.searchInfo?.textSnippet ?? null,
    viewability: v.accessInfo?.viewability ?? null,
    publicDomain: v.accessInfo?.publicDomain ?? false,
    thumbnail: vi.imageLinks?.thumbnail ?? null,
  };
}
