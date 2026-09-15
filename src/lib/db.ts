import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

// 単一プロセス前提のローカルDB（node:sqlite）。PostgreSQLへ移す場合はこの層だけ差し替える。
const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "booklens.db");

declare global {
  var __booklensDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      ol_work_key TEXT,
      ol_edition_key TEXT,
      isbn10 TEXT,
      isbn13 TEXT,
      title TEXT NOT NULL,
      subtitle TEXT,
      original_title TEXT,
      authors TEXT NOT NULL DEFAULT '[]',
      publisher TEXT,
      published_year INTEGER,
      language TEXT,
      cover_url TEXT,
      description TEXT,
      subjects TEXT NOT NULL DEFAULT '[]',
      source_type TEXT,                 -- 'A' (本文あり) / 'B' (本文なし)
      pages INTEGER,
      author_image TEXT,
      topic_image TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS books_isbn13 ON books(isbn13) WHERE isbn13 IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS books_ol_work ON books(ol_work_key) WHERE ol_work_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      analysis_id INTEGER,
      ref TEXT,                          -- S1, S2 ...
      source_type TEXT NOT NULL,         -- publisher / author / toc / preview / review / interview / library / wiki / fulltext / other
      title TEXT,
      url TEXT,
      tier INTEGER NOT NULL DEFAULT 4,   -- 1(最優先)〜4
      snippet TEXT,
      retrieved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS sources_book ON sources(book_id);

    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',   -- pending / running / done / error
      step TEXT,
      step_label TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      quick TEXT,                               -- 速報版（JSON）
      content TEXT,                             -- 本番要約（JSON）
      confidence TEXT,                          -- {overall, groundedness, coverage, source_quality, level}
      qa TEXT,                                  -- 品質評価結果（JSON）
      dossier TEXT,                             -- 収集した根拠資料
      fulltext_used INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      usage TEXT,                               -- トークン使用量（JSON）
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS analyses_book ON analyses(book_id, version);

    CREATE TABLE IF NOT EXISTS step_stats (
      step TEXT PRIMARY KEY,
      total_ms INTEGER NOT NULL DEFAULT 0,
      n INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_books (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      status TEXT NOT NULL,                     -- want / reading / done / summary_only
      saved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      section TEXT,
      correct_info TEXT,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS qa_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  migrate(db);
  return db;
}

/** 既存DBへの列追加（node:sqlite には IF NOT EXISTS が無いので table_info で判定） */
function migrate(db: DatabaseSync) {
  const acols = new Set((db.prepare("PRAGMA table_info(analyses)").all() as { name: string }[]).map((c) => c.name));
  const addA = (name: string, ddl: string) => { if (!acols.has(name)) db.exec(`ALTER TABLE analyses ADD COLUMN ${name} ${ddl}`); };
  addA("timeline", "TEXT");
  addA("extraction", "TEXT");
  addA("started_at", "TEXT");
  addA("visuals", "TEXT");
  addA("videos", "TEXT");     // AI動画キャッシュ {"5":[...],"10":[...],"20":[...]}
  const bcols = new Set((db.prepare("PRAGMA table_info(books)").all() as { name: string }[]).map((c) => c.name));
  if (!bcols.has("pages")) db.exec("ALTER TABLE books ADD COLUMN pages INTEGER");
  if (!bcols.has("author_image")) db.exec("ALTER TABLE books ADD COLUMN author_image TEXT");
  if (!bcols.has("topic_image")) db.exec("ALTER TABLE books ADD COLUMN topic_image TEXT");
}

export function db(): DatabaseSync {
  if (!globalThis.__booklensDb) globalThis.__booklensDb = open();
  return globalThis.__booklensDb;
}

// ---------- 型 ----------
export type BookRow = {
  id: string;
  ol_work_key: string | null;
  ol_edition_key: string | null;
  isbn10: string | null;
  isbn13: string | null;
  title: string;
  subtitle: string | null;
  original_title: string | null;
  authors: string; // JSON
  publisher: string | null;
  published_year: number | null;
  language: string | null;
  cover_url: string | null;
  description: string | null;
  subjects: string; // JSON
  source_type: "A" | "B" | null;
  pages: number | null;
  author_image: string | null;
  topic_image: string | null;
  views: number;
  created_at: string;
};

export type AnalysisRow = {
  id: number;
  book_id: string;
  version: number;
  status: "pending" | "running" | "done" | "error";
  step: string | null;
  step_label: string | null;
  progress: number;
  quick: string | null;
  content: string | null;
  confidence: string | null;
  qa: string | null;
  dossier: string | null;
  fulltext_used: number;
  error: string | null;
  usage: string | null;
  timeline: string | null;
  extraction: string | null;
  visuals: string | null;
  videos: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimelineEntry = { step: string; label: string; started_at: number; ended_at: number | null };

export type SourceRow = {
  id: number;
  book_id: string;
  analysis_id: number | null;
  ref: string | null;
  source_type: string;
  title: string | null;
  url: string | null;
  tier: number;
  snippet: string | null;
  retrieved_at: string;
};

// ---------- books ----------
export function getBook(id: string): BookRow | undefined {
  return db().prepare("SELECT * FROM books WHERE id = ?").get(id) as BookRow | undefined;
}

export function findBookByKeys(opts: { isbn13?: string | null; olWorkKey?: string | null }): BookRow | undefined {
  if (opts.isbn13) {
    const r = db().prepare("SELECT * FROM books WHERE isbn13 = ?").get(opts.isbn13) as BookRow | undefined;
    if (r) return r;
  }
  if (opts.olWorkKey) {
    return db().prepare("SELECT * FROM books WHERE ol_work_key = ?").get(opts.olWorkKey) as BookRow | undefined;
  }
  return undefined;
}

export function insertBook(b: Omit<BookRow, "views" | "created_at">): BookRow {
  db()
    .prepare(
      `INSERT INTO books (id, ol_work_key, ol_edition_key, isbn10, isbn13, title, subtitle, original_title, authors, publisher, published_year, language, cover_url, description, subjects, source_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      b.id, b.ol_work_key, b.ol_edition_key, b.isbn10, b.isbn13, b.title, b.subtitle, b.original_title,
      b.authors, b.publisher, b.published_year, b.language, b.cover_url, b.description, b.subjects, b.source_type,
    );
  return getBook(b.id)!;
}

export function updateBook(id: string, patch: Partial<BookRow>) {
  const keys = Object.keys(patch) as (keyof BookRow)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  db().prepare(`UPDATE books SET ${sets} WHERE id = ?`).run(...keys.map((k) => patch[k] as string | number | null), id);
}

export function bumpViews(id: string) {
  db().prepare("UPDATE books SET views = views + 1 WHERE id = ?").run(id);
}

export function popularBooks(limit = 8): BookRow[] {
  return db()
    .prepare(
      `SELECT b.* FROM books b
       JOIN analyses a ON a.book_id = b.id AND a.status = 'done'
       GROUP BY b.id ORDER BY b.views DESC, b.created_at DESC LIMIT ?`,
    )
    .all(limit) as BookRow[];
}

// ---------- analyses ----------
export function latestAnalysis(bookId: string): AnalysisRow | undefined {
  return db()
    .prepare("SELECT * FROM analyses WHERE book_id = ? ORDER BY version DESC, id DESC LIMIT 1")
    .get(bookId) as AnalysisRow | undefined;
}

export function createAnalysis(bookId: string): AnalysisRow {
  const prev = latestAnalysis(bookId);
  const version = prev ? prev.version + 1 : 1;
  const r = db()
    .prepare("INSERT INTO analyses (book_id, version, status, step, step_label) VALUES (?, ?, 'pending', 'queued', '準備しています')")
    .run(bookId, version);
  return db().prepare("SELECT * FROM analyses WHERE id = ?").get(Number(r.lastInsertRowid)) as AnalysisRow;
}

export function updateAnalysis(id: number, patch: Partial<AnalysisRow>) {
  const keys = Object.keys(patch) as (keyof AnalysisRow)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  db()
    .prepare(`UPDATE analyses SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => patch[k] as string | number | null), id);
}

// ---------- step stats（所要時間の学習） ----------
export function recordStepDuration(step: string, ms: number) {
  db()
    .prepare("INSERT INTO step_stats (step, total_ms, n) VALUES (?, ?, 1) ON CONFLICT(step) DO UPDATE SET total_ms = total_ms + excluded.total_ms, n = n + 1")
    .run(step, Math.max(0, Math.round(ms)));
}

export function stepAverages(): Record<string, number> {
  const rows = db().prepare("SELECT step, total_ms, n FROM step_stats").all() as { step: string; total_ms: number; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.step, r.n > 0 ? r.total_ms / r.n : 0]));
}

// ---------- sources ----------
export function replaceSources(bookId: string, analysisId: number, rows: Omit<SourceRow, "id" | "book_id" | "analysis_id" | "retrieved_at">[]) {
  const d = db();
  d.prepare("DELETE FROM sources WHERE book_id = ?").run(bookId);
  const ins = d.prepare(
    "INSERT INTO sources (book_id, analysis_id, ref, source_type, title, url, tier, snippet) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const s of rows) ins.run(bookId, analysisId, s.ref, s.source_type, s.title, s.url, s.tier, s.snippet);
}

export function listSources(bookId: string): SourceRow[] {
  return db().prepare("SELECT * FROM sources WHERE book_id = ? ORDER BY tier ASC, id ASC").all(bookId) as SourceRow[];
}

// ---------- library ----------
export function setLibraryStatus(bookId: string, status: string | null) {
  if (!status) db().prepare("DELETE FROM user_books WHERE book_id = ?").run(bookId);
  else
    db()
      .prepare("INSERT INTO user_books (book_id, status) VALUES (?, ?) ON CONFLICT(book_id) DO UPDATE SET status = excluded.status, saved_at = datetime('now')")
      .run(bookId, status);
}

export function getLibraryStatus(bookId: string): string | null {
  const r = db().prepare("SELECT status FROM user_books WHERE book_id = ?").get(bookId) as { status: string } | undefined;
  return r?.status ?? null;
}

/** 復習向けに1冊選ぶ：ライブラリ（無ければ要約済み全体）から、直近閲覧が古い順で先頭。 */
export function pickTodayBook(): BookRow | undefined {
  const lib = db()
    .prepare("SELECT b.* FROM user_books u JOIN books b ON b.id = u.book_id JOIN analyses a ON a.book_id = b.id AND a.status='done' GROUP BY b.id ORDER BY b.views ASC, u.saved_at ASC LIMIT 1")
    .get() as BookRow | undefined;
  if (lib) return lib;
  return db()
    .prepare("SELECT b.* FROM books b JOIN analyses a ON a.book_id=b.id AND a.status='done' GROUP BY b.id ORDER BY b.views ASC, b.created_at DESC LIMIT 1")
    .get() as BookRow | undefined;
}

export function listLibrary(): (BookRow & { status: string; saved_at: string })[] {
  return db()
    .prepare("SELECT b.*, u.status, u.saved_at FROM user_books u JOIN books b ON b.id = u.book_id ORDER BY u.saved_at DESC")
    .all() as (BookRow & { status: string; saved_at: string })[];
}

// ---------- reports / chat ----------
export function insertReport(bookId: string, section: string, correct: string, comment: string) {
  db().prepare("INSERT INTO reports (book_id, section, correct_info, comment) VALUES (?, ?, ?, ?)").run(bookId, section, correct, comment);
}

export function listChat(bookId: string): { role: "user" | "assistant"; content: string }[] {
  return db().prepare("SELECT role, content FROM qa_messages WHERE book_id = ? ORDER BY id ASC").all(bookId) as {
    role: "user" | "assistant";
    content: string;
  }[];
}

export function appendChat(bookId: string, role: "user" | "assistant", content: string) {
  db().prepare("INSERT INTO qa_messages (book_id, role, content) VALUES (?, ?, ?)").run(bookId, role, content);
}

export function clearChat(bookId: string) {
  db().prepare("DELETE FROM qa_messages WHERE book_id = ?").run(bookId);
}
