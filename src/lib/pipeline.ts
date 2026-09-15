import crypto from "node:crypto";
import {
  type BookRow, type AnalysisRow, type TimelineEntry, findBookByKeys, insertBook, updateBook, createAnalysis, updateAnalysis, latestAnalysis,
  replaceSources, recordStepDuration,
} from "./db";
import type { Candidate, BookFacts, PrefetchedSource } from "./books/types";
import { fetchWork, fetchEditions, fetchEdition, fetchAuthor, lookupByIsbn, type EditionInfo } from "./books/openlibrary";
import { fetchWikipedia } from "./books/wikipedia";
import { fetchGoogleBooks } from "./books/googlebooks";
import { fetchGutenbergFullText } from "./books/gutenberg";
import { fetchOpenBD } from "./books/openbd";
import { fetchNdlByIsbn, isbn13to10, amazonCover } from "./books/ndl";
import { buildDossier, extractSourceList, gapFill } from "./ai/research";
import { quickBrief, extractEvidence, generateAnalysis, generateVisuals, checkAnalysis } from "./ai/summarize";
import { evidenceSystemBlock } from "./ai/prompts";
import { computeConfidence } from "./ai/confidence";
import { emptyUsage, hasApiKey } from "./ai/client";

const running = new Map<string, Promise<void>>();

/** 候補 → books 行。ISBN があれば openBD / NDL / Open Library で書誌を補完する。 */
export async function ensureBook(c: Candidate): Promise<BookRow> {
  const existing = findBookByKeys({ isbn13: c.isbn13, olWorkKey: c.olWorkKey });
  if (existing) return existing;

  let olWorkKey = c.olWorkKey;
  let olEditionKey = c.olEditionKey;
  let coverUrl = c.coverUrl;
  let publisher = c.publisher;
  let year = c.year;
  let subtitle = c.subtitle;
  let isbn13 = c.isbn13;
  let isbn10 = c.isbn10;

  if (olEditionKey) {
    const ed = await fetchEdition(olEditionKey);
    isbn13 = isbn13 ?? ed?.isbn13 ?? null;
    isbn10 = isbn10 ?? ed?.isbn10 ?? null;
    publisher = publisher ?? ed?.publisher ?? null;
  }
  if (isbn13) {
    const [bd, ol] = await Promise.all([fetchOpenBD(isbn13), olWorkKey ? null : lookupByIsbn(isbn13)]);
    if (bd) {
      publisher = publisher ?? bd.publisher;
      year = year ?? bd.year;
      subtitle = subtitle ?? bd.subtitle;
      coverUrl = bd.cover ?? coverUrl;
    }
    if (ol) {
      olWorkKey = olWorkKey ?? ol.workKey;
      olEditionKey = olEditionKey ?? ol.editionKey;
      coverUrl = coverUrl ?? ol.coverUrl;
    }
    if (!isbn10) isbn10 = isbn13to10(isbn13);
    if (!coverUrl && isbn10 && c.language === "jpn") coverUrl = amazonCover(isbn10);
  }
  // ISBN で紐付いた OL work が既に登録済みなら重複させない
  if (olWorkKey) {
    const dup = findBookByKeys({ olWorkKey });
    if (dup) return dup;
  }

  const id = crypto.randomBytes(6).toString("base64url");
  return insertBook({
    id, ol_work_key: olWorkKey, ol_edition_key: olEditionKey, isbn10, isbn13,
    title: c.title, subtitle, original_title: null, authors: JSON.stringify(c.authors),
    publisher, published_year: year, language: c.language, cover_url: coverUrl, description: null, subjects: "[]", source_type: null, pages: null, author_image: null, topic_image: null,
  });
}

/** 生成ジョブを開始（既に走っていればそれを返す）。 */
export function startAnalysis(book: BookRow, force = false): AnalysisRow {
  const latest = latestAnalysis(book.id);
  if (latest && (latest.status === "running" || latest.status === "pending") && running.has(book.id)) return latest;
  if (latest && latest.status === "done" && !force) return latest;
  const a = createAnalysis(book.id);
  const p = runPipeline(book, a)
    .catch((e: unknown) => {
      console.error("[pipeline]", book.id, e);
      updateAnalysis(a.id, { status: "error", error: e instanceof Error ? e.message : String(e), step: "error", step_label: "エラーが発生しました" });
    })
    .finally(() => running.delete(book.id));
  running.set(book.id, p);
  return a;
}

/** ステップ進行を DB に記録し、完了したステップの所要時間を学習する */
class Progress {
  private timeline: TimelineEntry[] = [];
  private analysisId: number;
  constructor(analysisId: number) {
    this.analysisId = analysisId;
    updateAnalysis(analysisId, { started_at: new Date().toISOString(), status: "running" });
  }
  step(step: string, label: string, progress: number) {
    const now = Date.now();
    const last = this.timeline[this.timeline.length - 1];
    if (last && !last.ended_at) {
      last.ended_at = now;
      recordStepDuration(last.step, now - last.started_at);
    }
    this.timeline.push({ step, label, started_at: now, ended_at: null });
    updateAnalysis(this.analysisId, { status: "running", step, step_label: label, progress, timeline: JSON.stringify(this.timeline) });
  }
  finish() {
    const now = Date.now();
    const last = this.timeline[this.timeline.length - 1];
    if (last && !last.ended_at) { last.ended_at = now; recordStepDuration(last.step, now - last.started_at); }
    return JSON.stringify(this.timeline);
  }
}

async function runPipeline(book: BookRow, a: AnalysisRow) {
  if (!hasApiKey()) throw new Error("ANTHROPIC_API_KEY が設定されていません（.env.local）");
  const usage = emptyUsage();
  const P = new Progress(a.id);
  const authors = JSON.parse(book.authors) as string[];
  const mainAuthor = authors[0] ?? null;
  const isJa = book.language === "jpn" || /[぀-ヿ一-鿿]/.test(book.title);

  // ---- STEP 1-2: 書籍特定・書誌情報 ----
  P.step("identify", "本を特定しています", 4);
  const [work, editions, thisEdition, bd, ndl] = await Promise.all([
    book.ol_work_key ? fetchWork(book.ol_work_key) : null,
    book.ol_work_key ? fetchEditions(book.ol_work_key) : ([] as EditionInfo[]),
    book.ol_edition_key ? fetchEdition(book.ol_edition_key) : null,
    book.isbn13 ? fetchOpenBD(book.isbn13) : null,
    book.isbn13 && isJa ? fetchNdlByIsbn(book.isbn13) : null,
  ]);

  const sameLang = editions.filter((e) => !book.language || !e.language || e.language === book.language);
  const tocEdition = [thisEdition, ...sameLang, ...editions].find((e) => e?.toc && e.toc.length >= 3) ?? null;
  const related = editions
    .filter((e) => e.language && e.language !== book.language && e.isbn13)
    .slice(0, 6)
    .map((e) => ({ title: e.title ?? book.title, language: e.language, isbn13: e.isbn13, year: e.year }));
  const originalTitle = thisEdition?.translationOf ?? editions.find((e) => e.translationOf)?.translationOf ?? null;

  const facts: BookFacts = {
    title: book.title,
    subtitle: book.subtitle ?? work?.subtitle ?? bd?.subtitle ?? null,
    originalTitle,
    authors,
    year: book.published_year ?? bd?.year ?? ndl?.year ?? null,
    publisher: book.publisher ?? thisEdition?.publisher ?? bd?.publisher ?? ndl?.publisher ?? null,
    isbn13: book.isbn13 ?? thisEdition?.isbn13 ?? null,
    isbn10: book.isbn10,
    language: book.language,
    description: work?.description ?? bd?.description ?? null,
    subjects: [...(work?.subjects ?? []), ...(ndl?.subjects ?? [])].slice(0, 20),
    toc: tocEdition?.toc ?? bd?.toc ?? null,
    relatedEditions: related,
    coverUrl: book.cover_url ?? work?.coverUrl ?? bd?.cover ?? null,
  };
  const pagesNum = thisEdition?.pages ?? (ndl?.pages ? Number((ndl.pages.match(/\d+/) ?? [])[0]) || null : null);
  updateBook(book.id, {
    description: facts.description, subjects: JSON.stringify(facts.subjects), original_title: originalTitle,
    cover_url: facts.coverUrl, publisher: facts.publisher, isbn13: facts.isbn13, published_year: facts.year,
    pages: pagesNum,
  });

  // ---- STEP 4-5: 公式情報・目次・百科事典（決定的に取れるもの） ----
  P.step("prefetch", "公式情報と目次を集めています", 10);
  const pre: PrefetchedSource[] = [];
  let n = 0;
  const push = (s: Omit<PrefetchedSource, "ref">) => pre.push({ ref: `S${++n}`, ...s });

  if (bd?.description)
    push({ type: "publisher", tier: 1, title: "openBD — 版元の紹介文", url: `https://api.openbd.jp/v1/get?isbn=${book.isbn13}`, text: bd.description.slice(0, 4000) });
  if (work?.description)
    push({ type: "library", tier: 2, title: "Open Library — work description", url: `https://openlibrary.org${book.ol_work_key}`, text: work.description.slice(0, 4000) });
  if (facts.toc) {
    const fromBd = !tocEdition?.toc && bd?.toc;
    push({
      type: "toc", tier: 1,
      title: fromBd ? "目次（openBD / 版元データ）" : `Table of contents (Open Library edition ${tocEdition?.key})`,
      url: fromBd ? `https://api.openbd.jp/v1/get?isbn=${book.isbn13}` : `https://openlibrary.org${tocEdition?.key}`,
      text: facts.toc.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    });
  }
  if (ndl)
    push({ type: "library", tier: 2, title: "国立国会図書館サーチ — 書誌", url: ndl.link, text: [`題名: ${ndl.title}${ndl.subtitle ? `：${ndl.subtitle}` : ""}`, `著者: ${ndl.creators.join(", ")}`, `出版社: ${ndl.publisher ?? ""} ${ndl.year ?? ""}`, ndl.series ? `シリーズ: ${ndl.series}` : "", ndl.pages ? `ページ: ${ndl.pages}` : "", ndl.subjects.length ? `件名: ${ndl.subjects.join("; ")}` : ""].filter(Boolean).join("\n") });

  const gb = await fetchGoogleBooks({ isbn13: facts.isbn13, title: facts.title, author: mainAuthor });
  if (gb?.description)
    push({ type: "publisher", tier: 1, title: "Google Books — publisher description", url: gb.infoLink, text: gb.description + (gb.snippet ? `\n\nSnippet: ${gb.snippet}` : "") });

  const wiki = await fetchWikipedia(facts.title, mainAuthor, isJa ? ["ja", "en"] : ["en", "ja"]);
  for (const w of wiki)
    push({ type: "wiki", tier: 2, title: `Wikipedia (${w.lang}) — ${w.title}${w.kind === "author" ? " [author]" : ""}`, url: w.url, text: w.text });
  const authorImg = wiki.find((w) => w.kind === "author" && w.image)?.image ?? null;
  const topicImg = wiki.find((w) => w.kind === "book" && w.image)?.image ?? null;
  if (authorImg || topicImg) updateBook(book.id, { author_image: authorImg, topic_image: topicImg });

  for (const key of (work?.authorKeys ?? []).slice(0, 2)) {
    const au = await fetchAuthor(key);
    if (au?.bio) push({ type: "library", tier: 2, title: `Open Library — author: ${au.name}`, url: `https://openlibrary.org${key}`, text: au.bio.slice(0, 2000) });
  }

  // ---- 速報版（§54: 先に簡易結果を出す） ----
  P.step("quick", "速報版を作っています", 16);
  try {
    const quick = await quickBrief(facts, pre, usage);
    if (quick) updateAnalysis(a.id, { quick: JSON.stringify(quick) });
  } catch (e) {
    console.warn("[pipeline] quick brief failed", e);
  }

  // ---- STEP 3: 本文利用可能性判定（A/B） ----
  P.step("availability", "本文が利用できるか確認しています", 22);
  let mode: "A" | "B" = "B";
  let dossier: string;
  const fulltext = isJa ? null : await fetchGutenbergFullText(facts.title, mainAuthor);
  if (fulltext) {
    mode = "A";
    pre.unshift({ ref: "S0", type: "fulltext", tier: 1, title: `Project Gutenberg full text (#${fulltext.id})${fulltext.truncated ? " [truncated]" : ""}`, url: fulltext.url, text: "" });
    P.step("fulltext", "本文を読み込んでいます", 30);
    dossier = pre
      .map((s) => `### ${s.ref} [tier ${s.tier}] (${s.type}) ${s.title}${s.url ? `\nURL: ${s.url}` : ""}\n${s.ref === "S0" ? fulltext.text : s.text}`)
      .join("\n\n");
  } else {
    // ---- STEP 6-9: 収集・照合（Bタイプ） ----
    P.step("research", "出版社・著者・書評をWebで調べています", 28);
    dossier = await buildDossier(facts, pre, usage, (msg) => P.step("research", msg, 36));
  }
  updateBook(book.id, { source_type: mode });
  updateAnalysis(a.id, { dossier, fulltext_used: mode === "A" ? 1 : 0 });

  P.step("sources", "情報源を整理しています", 44);
  let sourceList = await extractSourceList(dossier, usage);

  // 足りないものがあれば追加調査（目次・一次情報）
  if (mode === "B") {
    const missing: string[] = [];
    if (!sourceList.toc_found) missing.push("table of contents");
    if (sourceList.primary_source_count < 2) missing.push("publisher official description or author official page");
    if (missing.length) {
      P.step("gapfill", `追加で探しています：${missing.includes("table of contents") ? "目次" : "一次情報"}`, 50);
      const extra = await gapFill(facts, dossier, missing, sourceList.sources.length + 1, usage);
      if (extra && !/^\s*NOT FOUND\s*$/m.test(extra.trim()) ) {
        dossier = `${dossier}\n\n---\n\n# ADDITIONAL RESEARCH\n${extra}`;
        updateAnalysis(a.id, { dossier });
        sourceList = await extractSourceList(dossier, usage);
      }
    }
  }
  replaceSources(book.id, a.id, sourceList.sources.map((s) => ({ ref: s.ref, source_type: s.type, title: s.title, url: s.url, tier: s.tier, snippet: s.summary })));

  // ---- STEP 10-12: 抽出 → 生成 → 事実確認 → 必要なら再生成（最大2回） ----
  const evidence = evidenceSystemBlock(facts, dossier, mode);
  P.step("extract", "根拠から概念・主張・具体例を抽出しています", 56);
  const extraction = await extractEvidence(evidence, usage);
  updateAnalysis(a.id, { extraction: JSON.stringify(extraction) });

  P.step("summarize", "重要ポイントを整理して要約を書いています", 64);
  const analysis = await generateAnalysis(evidence, extraction, usage);

  // 事実確認と図解生成を並列実行（速度優先）。書き直しループは廃止（抽出＋根拠ルールで品質担保）。
  P.step("verify", "内容の確認と図解を作成しています", 84);
  const [qa, visuals] = await Promise.all([
    checkAnalysis(evidence, analysis, usage),
    generateVisuals(evidence, analysis, extraction, usage).catch((e) => {
      console.warn("[pipeline] visuals failed", e);
      return null;
    }),
  ]);

  // ---- STEP 13: 保存 ----
  const confidence = computeConfidence(mode, sourceList, qa);
  const timeline = P.finish();
  updateAnalysis(a.id, {
    status: "done", step: "done", step_label: "完了", progress: 100, timeline,
    content: JSON.stringify(analysis), qa: JSON.stringify(qa), confidence: JSON.stringify(confidence),
    visuals: visuals ? JSON.stringify(visuals) : null, usage: JSON.stringify(usage),
  });
}
