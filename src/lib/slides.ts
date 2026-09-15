import type { Analysis } from "./ai/schemas";
import type { Slide } from "@/components/SlidePlayer";

/** 1冊分の解説スライド。AIナレーション台本があればそれを使う。 */
export function singleBookSlides(a: Analysis, title: string, authors: string): Slide[] {
  const nar = a.narration ?? [];
  if (nar.length) {
    return [
      { kind: "cover", heading: "解説をはじめます", lines: [title, authors, a.brief30.one_liner], narration: `${title}。${a.brief30.one_liner}` },
      ...nar.map((n): Slide => ({ kind: "scripted", heading: n.title, lines: [n.script], narration: n.script })),
    ];
  }
  const out: Slide[] = [];
  out.push({ kind: "cover", heading: "解説をはじめます", lines: [title, authors, a.brief30.one_liner], narration: `${title}。${a.brief30.one_liner}` });
  out.push({ kind: "core", heading: "この本で一番大事なこと", lines: [a.most_important.message, a.most_important.explanation], narration: `この本で一番大事なこと。${a.most_important.message}。${a.most_important.explanation}` });
  a.key_points.forEach((p, i) => out.push({ kind: "point", heading: `重要ポイント ${i + 1}／${a.key_points.length}`, lines: [p.title, p.body], narration: `ポイント${i + 1}、${p.title}。${p.body}` }));
  out.push({ kind: "action", heading: "今日から使える1つ", lines: [a.today_action.action, a.today_action.why], narration: `今日から使えること。${a.today_action.action}。${a.today_action.why}` });
  out.push({ kind: "why", heading: "なぜこの本が重要か", lines: [a.why_care], narration: `なぜこの本が重要か。${a.why_care}` });
  return out;
}

/** 複数冊の横断ダイジェスト（各冊の核だけを繋ぐ）。 */
export function multiBookSlides(books: { title: string; authors: string; a: Analysis }[]): Slide[] {
  const out: Slide[] = [];
  out.push({
    kind: "cover", heading: "まとめて解説", lines: [`${books.length}冊の要点ダイジェスト`, "", books.map((b) => b.title).join(" / ")],
    narration: `${books.length}冊の要点をまとめて解説します。${books.map((b) => b.title).join("、")}。`,
  });
  books.forEach((b, i) => {
    out.push({ kind: "core", badge: `${i + 1}/${books.length}冊目`, heading: b.title, lines: [b.a.most_important.message, b.a.most_important.explanation], narration: `${i + 1}冊目、${b.title}。一番大事なことは、${b.a.most_important.message}。${b.a.most_important.explanation}` });
    out.push({ kind: "action", badge: `${i + 1}/${books.length}冊目`, heading: `${b.title}｜今日から使える`, lines: [b.a.today_action.action], narration: `この本から今日使えることは、${b.a.today_action.action}` });
  });
  out.push({ kind: "why", heading: "以上、ダイジェストでした", lines: ["それぞれの本を開くと、図解・重要ポイント・質問ができます。"], narration: "以上、まとめ解説でした。気になった本を開くと、図解や重要ポイントを詳しく見られます。" });
  return out;
}

/** 要約テキスト量から読了目安（分）を出す。原著はページ数から推定（なければ既定）。 */
export function timeEstimate(a: Analysis, pages: number | null): { origHours: number; summaryMin: number; savedPct: number } {
  const summaryChars =
    a.brief30.one_liner.length + a.most_important.message.length + a.most_important.explanation.length +
    a.key_points.reduce((n, p) => n + p.title.length + p.body.length, 0) +
    a.brief180.problem.length + a.brief180.conclusion.length + a.brief180.concepts.reduce((n, c) => n + c.description.length, 0);
  const summaryMin = Math.max(3, Math.round(summaryChars / 500));
  const origMin = pages && pages > 0 ? Math.round(pages * 1.8) : 360; // 日本語書籍 ~1.8分/頁、既定6時間
  const origHours = Math.max(1, Math.round(origMin / 60));
  const savedPct = Math.min(99, Math.round((1 - summaryMin / origMin) * 100));
  return { origHours, summaryMin, savedPct };
}
