export type Candidate = {
  olWorkKey: string | null;      // /works/OL...W
  olEditionKey: string | null;   // OL...M
  title: string;
  subtitle: string | null;
  authors: string[];
  year: number | null;
  isbn13: string | null;
  isbn10: string | null;
  coverUrl: string | null;
  language: string | null;       // eng / jpn ...
  publisher: string | null;
  ebookAccess: string | null;    // public / borrowable / printdisabled / no_ebook
  editionCount: number;
  source: "openlibrary" | "googlebooks" | "ndl" | "ai";
  cached?: boolean;             // 既に要約済み（即表示できる）
  note?: string | null;         // AI検索時の補足
};

export type PrefetchedSource = {
  ref: string;
  type: "publisher" | "author" | "toc" | "preview" | "review" | "interview" | "library" | "wiki" | "fulltext" | "other";
  title: string;
  url: string | null;
  tier: 1 | 2 | 3 | 4;
  text: string;
};

export type BookFacts = {
  title: string;
  subtitle: string | null;
  originalTitle: string | null;
  authors: string[];
  year: number | null;
  publisher: string | null;
  isbn13: string | null;
  isbn10: string | null;
  language: string | null;
  description: string | null;
  subjects: string[];
  toc: string[] | null;
  relatedEditions: { title: string; language: string | null; isbn13: string | null; year: number | null }[];
  coverUrl: string | null;
  nextRef?: number;              // 追加調査時の情報源番号の続き
};
