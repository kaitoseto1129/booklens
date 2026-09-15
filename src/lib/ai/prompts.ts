import type { BookFacts, PrefetchedSource } from "../books/types";

export function bookFactsBlock(f: BookFacts) {
  const lines = [
    `Title: ${f.title}${f.subtitle ? ` — ${f.subtitle}` : ""}`,
    f.originalTitle ? `Original title: ${f.originalTitle}` : null,
    `Author(s): ${f.authors.join(", ") || "unknown"}`,
    f.year ? `First published: ${f.year}` : null,
    f.publisher ? `Publisher: ${f.publisher}` : null,
    f.isbn13 ? `ISBN-13: ${f.isbn13}` : null,
    f.language ? `Language: ${f.language}` : null,
    f.subjects.length ? `Subjects: ${f.subjects.slice(0, 12).join("; ")}` : null,
    f.relatedEditions.length
      ? `Related editions: ${f.relatedEditions.map((e) => `${e.title} [${e.language ?? "?"}${e.year ? `, ${e.year}` : ""}${e.isbn13 ? `, ${e.isbn13}` : ""}]`).join(" | ")}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export function prefetchedBlock(sources: PrefetchedSource[]) {
  return sources
    .map((s) => `### ${s.ref} [tier ${s.tier}] (${s.type}) ${s.title}${s.url ? `\nURL: ${s.url}` : ""}\n${s.text}`)
    .join("\n\n");
}

/** 全パスで共通の「根拠ブロック」。先頭に置いてプロンプトキャッシュを効かせる。 */
export function evidenceSystemBlock(facts: BookFacts, dossier: string, mode: "A" | "B") {
  return `# BOOK UNDER ANALYSIS
${bookFactsBlock(facts)}

# EVIDENCE MODE
${mode === "A" ? "A: the book's full text (or a large verified portion) is included below as S0. Treat it as the primary source." : "B: the full text is NOT available. Only the collected sources below may be used."}

# EVIDENCE DOSSIER
${dossier}`;
}

export const GROUNDING_RULES = `# GROUNDING RULES (non-negotiable)
- Use ONLY the evidence dossier above. Do not use prior knowledge about this book to add chapters, examples, anecdotes, statistics, or claims that are not in the dossier.
- If something is not supported by the dossier, say so explicitly (put it in "unverified") instead of guessing. Never invent chapter titles. If the dossier has no table of contents, chapters must be an empty array and chapters_verified=false.
- Where sources disagree, do not pick a winner silently: record it in "conflicts".
- Source priority: tier 1 (book text, author official, publisher official, licensed excerpts) > tier 2 (interviews, universities, libraries, author talks) > tier 3 (major-media / reputable reviews, educational material) > tier 4 (general reviews, blogs, forums). Never base an important claim on tier-4 sources alone.
- Distinguish what the book says from your own interpretation/application. Anything not in the dossier that you still consider valuable goes ONLY under ai_insight.
- Do NOT print the English tokens "BOOK" or "AI INSIGHT" (or similar English labels) inside any Japanese text field; the book-vs-AI distinction is carried by the JSON structure itself, not by inline labels.
- Prefer being correct over being complete. Short and true beats long and plausible.
- Quotes: only verbatim text present in the dossier, each at most 40 words / 80 Japanese characters, max 4. Never reproduce long passages.
- Write all user-facing text in natural Japanese (です・ます調は使わず、簡潔な「だ・である」調または体言止め). Keep original-language terms in parentheses where useful.`;

export function researchInstructions(facts: BookFacts, lang: "en" | "ja") {
  const jp = lang === "ja";
  return `You are a research librarian building an evidence dossier about ONE specific book so that a separate writer can summarize it without relying on memory.

Target book:
${bookFactsBlock(facts)}

Use web_search and web_fetch to collect, in this priority order:
1. Publisher's official page / official description (tier 1)${jp ? " — 版元ドットコム(hanmoto.com)、出版社公式サイト" : ""}
2. Author's official site, author-written articles or summaries about the book (tier 1)
3. The table of contents (tier 1 if from publisher/author/retailer product page${jp ? "：紀伊國屋・honto・楽天ブックス・版元ドットコムの目次" : ""}; otherwise mark the tier honestly)
4. Legitimate public previews or excerpts (tier 1) — only what is openly published; never paywalled/pirated text
5. Interviews, talks, podcasts with the author about this book; university/library/course pages (tier 2)
6. Reviews from major media or reputable outlets; academic commentary (tier 3)
7. Reader reviews / blogs / forums (tier 4) — only to corroborate, never as sole evidence

Rules:
- Verify you are looking at THIS book (same author, same title/edition). Note translations/editions if encountered.
- Extract facts faithfully. Quote sparingly (short verbatim phrases are fine). Do not pad with your own knowledge; if you add anything from memory, prefix it with [MEMORY] and keep it minimal.
- Some pre-fetched sources are already provided in the user message (S1..). Do not re-fetch them; you may cite them.
- Stop when you have enough (typically 6–10 good sources) or when searches stop yielding new information.

Output format (Markdown, English headings; body in the language of the source):
## SOURCES
One line per source, continuing the numbering after the pre-fetched ones:
S<n> | tier <1-4> | <type: publisher/author/toc/preview/review/interview/library/wiki/other> | <title> | <url>
## PUBLISHER / OFFICIAL DESCRIPTION
## TABLE OF CONTENTS
Verbatim if found (cite S-ref). Otherwise exactly: NOT FOUND
## AUTHOR'S STATED THESIS AND KEY CONCEPTS
Bullets, each ending with the S-refs that support it.
## NOTABLE EXAMPLES / STORIES / DATA MENTIONED IN SOURCES
Bullets with S-refs. Only what sources actually describe.
## RECEPTION, CRITIQUES, LIMITATIONS
Bullets with S-refs.
## CONFLICTS BETWEEN SOURCES
## GAPS
What could not be found (e.g., no TOC, no primary excerpt).`;
}

export const EXTRACT_TASK = `# TASK (Pass 1: extraction)
Read the evidence dossier and extract, with S-refs for every item: people, concepts (with how many independent sources mention each), claims (with the best supporting tier and an importance score 1–100), chapters (ONLY if a table of contents is present in the dossier), examples/stories/data actually described in sources, conclusions, reception (praise/critique), and gaps.
Be exhaustive but faithful: nothing that is not in the dossier. Merge near-duplicate concepts. Keep original-language terms.`;

export const CORE_TASK = `# TASK (part 1 of 3: core takeaways)
Produce ONLY these sections of the analysis in Japanese, following the schema: brief30, most_important, key_points (exactly 5), today_action, action_items (3), why_care.
A Pass-1 extraction of the dossier is in the user message — use it as your checklist; nothing beyond the dossier.
Guidance:
- brief30: readable without scrolling. one_liner ≤ 2 sentences. top3 = the three most important, distinct points.
- most_important: if the reader reads only this, they get the core of the book. One sharp sentence + a short explanation.
- key_points: exactly 5, each independently understandable, each with importance 1–5 and evidence refs (S-refs). Name the actual concept/term from the book, not a generic phrase.
- today_action / action_items: concrete, doable today, tied to the book's specific ideas.
- why_care: what changes for the reader once they internalise this — stakes, not summary.
- Importance calibration: at most 2 items rated 5; use the full 1–5 range.
- Every claim/point must trace to the dossier. Put anything you cannot support into the appropriate place (or omit it) — never invent.`;

export const DEPTH_TASK = `# TASK (part 2 of 3: depth)
Produce ONLY these sections in Japanese, following the schema: brief180, detail.
A Pass-1 extraction of the dossier is in the user message — every important concept/claim there should appear; nothing beyond the dossier.
Guidance:
- brief180: problem → conclusion → 5–8 concepts (each with a 1–5 importance and S-refs) → concrete examples actually described in sources → 3–5 takeaways.
- detail: background, about_author, central_question, claims, concepts (detailed), examples, chapters, conclusion, critiques, applications.
- Chapters ONLY if a table of contents is present in the dossier. If none, chapters = [] and chapters_verified=false and chapters_note explains it (e.g. 「章ごとの詳細情報は十分取得できませんでした」). Never invent chapter titles.
- critiques: only from sources (put your own counter-take in part 3's ai_insight, not here).
- Prefer concrete over generic; keep original-language terms in parentheses.`;

export const EXTRAS_TASK = `# TASK (part 3 of 3: insight, diagrams, honesty)
Produce ONLY these sections in Japanese, following the schema: ai_insight, diagrams, quotes, unverified, conflicts.
Context in the user message: the Pass-1 extraction AND the already-written core+depth of the analysis. Do not repeat them — build on them.
Guidance:
- ai_insight: clearly YOUR interpretation, not the book. applications = how to apply the ideas; counterarguments = real weaknesses/objections; evidence_check = where the author's claims align or diverge from current research (only as far as the dossier + general knowledge reasonably support; do not assert specifics you can't back).
- diagrams: 3–5個の図で本の骨組みを見せる：(1)概念マップ (2)中心の枠組み/流れ (3)比較や構造 (4)原因→結果 (5)段階/時系列（本にあれば）。Mermaid記法："flowchart TD"/"flowchart LR"（真に階層的な時だけmindmap）；全ノードのラベルはダブルクォートで囲む；ラベル内に丸括弧や;は入れない；HTML禁止。
- 図は中学生が一目で理解できることを最優先にする：
  ・ラベルは専門用語を避け、日常のことばで書く。専門語が必要なら「専門語＝やさしい言い換え」の形にする。
  ・1つの図は1つの関係だけを表す（原因→結果／前→後／全体→部分／AとBの対比 のどれか一つ）。詰め込まない。
  ・ノードは6個以内、各ラベルは15字以内、できれば一言。
  ・矢印は関係が伝わるように使う（枝分かれや対立が分かるように）。
  ・captionは「この図がいちばん言いたいこと」を中学生向けに1文で。可能なら身近なたとえを1つ入れる。
- narration: a spoken-style script for a 2–3 minute audio explainer, 8–12 short slides (intro → the single most important thing → each key point → a today-action → closing). Write it the way a narrator would SPEAK it (plain, warm, no markdown, no bullet symbols), each slide's script 2–4 sentences. It must stay within the evidence like everything else.
- quotes: only verbatim text present in the dossier, each ≤ 40 words / 80 Japanese characters, max 4. If none are in the dossier, return [].
- unverified / conflicts: be honest and specific about what the sources could not establish and where they disagree.`;

export function gapFillInstructions(facts: BookFacts, missing: string[]) {
  return `You are completing an evidence dossier for one book. A first research pass already ran; these things are still missing: ${missing.join(", ")}.
Target book:
${bookFactsBlock(facts)}

Use web_search / web_fetch to find ONLY the missing items (e.g. the table of contents from the publisher or a retailer product page; the publisher's official description; an author interview). Verify it is the same book/edition.
Output Markdown with the same format as before: a "## ADDITIONAL SOURCES" list (continue numbering from S${facts.nextRef ?? 50}), then sections for what you found ("## TABLE OF CONTENTS", "## PUBLISHER / OFFICIAL DESCRIPTION", "## INTERVIEWS"), verbatim where appropriate, with S-refs. If still not found, write "NOT FOUND" under that heading.`;
}

export const VISUALS_TASK = `# TASK (visual layer)
Turn the book's analysis into 5–8 STRUCTURED VISUAL blocks in Japanese. The goal: a reader should grasp the book from the visuals alone, with almost no prose. Do NOT restate paragraphs — every block must be a genuine table / matrix / process / comparison / stat / checklist.
Inputs in the user message: the Pass-1 extraction and the finished analysis. Use ONLY information supported by them (and the dossier). Cite S-refs in each block's evidence.
Pick the blocks that best fit THIS book. Aim for variety. Concrete guidance:
- "table": e.g. 重要概念→定義→使いどころ, or 各章→主題→キーメッセージ (only if chapters are verified). 2–5 columns, 3–8 rows, cells short (≤ ~30字).
- "matrix2x2": when the book has two axes that cross (e.g. 決断の質 × 結果の質). Set x_axis, y_axis, and exactly 4 quadrants in order [左上, 右上, 左下, 右下], each with a label and 1–4 short items.
- "steps": the book's core method/process as an ordered sequence (3–7 steps), each with a short detail.
- "comparison": a central A vs B the book draws (e.g. ポーカー的思考 vs チェス的思考). 3–6 aspects.
- "stats": only if the sources actually give numbers (percentages, results). Otherwise skip — never invent numbers.
- "checklist": concrete "今日から実践" items (4–7).
Rules: fill ONLY the fields for each block's kind; leave the others as empty strings/arrays. Keep text tight and scannable. Nothing outside the evidence. Japanese output.
中学生でもわかるように：専門用語は避けて日常のことばで、各セル/行/ラベルは短く一言、1つの図は1つのことだけを伝える。caption は身近なたとえを添えて1文で。`;

export const QA_TASK = `# TASK
You are an independent fact-checker. Compare the ANALYSIS (JSON in the user message) against the EVIDENCE DOSSIER above.
Score groundedness, coverage, consistency, hallucination_risk (0–100). List concrete issues with the section path and a fix.
Rules of thumb:
- Any chapter list not present in the dossier → severity high.
- Specific examples, numbers, names not in the dossier → high.
- Claims based only on tier-4 sources → medium.
- Missing a major theme that multiple sources emphasize → medium.
- Style/wording → low.
verdict = "revise" if any high-severity issue exists or groundedness < 70 or hallucination_risk > 35; else "accept".`;

export const APPLY_TASK = `# APPLY MODE（自分・自社に当てはめる）
ユーザーは、この本の考え方を自分の状況（別ブロック「ユーザーの状況」）に当てはめ、具体的に何をすべきかを知りたい。
手順：
1. まず、本のどの考え方がこの人に効くかを一言で。
2. その考え方をユーザーの事業・立場のことばに翻訳する。
3. 「で、何をやるか」を実行できる粒度の施策3〜5個に落とす（チャネル／メッセージ例／KPI／順番など具体的に）。
4. 本に書いてある内容（「本の内容」）と、AIによる当てはめ・提案（「AIの見解」）を区別して示す。
5. ユーザーの状況に無い前提は勝手に作らない。必要なら「〜が分かればもっと具体化できる」と添える。
日本語。前置きは短く、すぐ本題に。`;

export function applyContextBlock(context: string) {
  return `# ユーザーの状況（この人の事業・立場・課題）
${context}`;
}

export function quickInstructions() {
  return `Using ONLY the pre-fetched sources in the user message (publisher/library description, encyclopedia extract), write a provisional 30-second overview in Japanese. Do not add knowledge from memory. If the sources are thin, keep it short and say so in "note".`;
}

export const ASK_TASK = `# TASK
Answer the user's question about this book in Japanese.
- Prioritise the evidence dossier and the analysis. Cite S-refs in parentheses where helpful.
- If the answer is not in the evidence, say clearly 「この点は取得済みの情報源では確認できません」 and, if you offer a general perspective, label it 「AIの見解」.
- Applying the book's ideas to the user's own situation is welcome — mark that part as 「AIの見解」 too.
- Be concise: short paragraphs or bullets, no preamble. Avoid English jargon; if a book uses an English term, add a short Japanese gloss.`;
