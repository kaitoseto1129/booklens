import type { Analysis, VideoSceneT, VisualBlockT } from "./ai/schemas";

type Scene = VideoSceneT;
const s = (p: Partial<Scene>): Scene => ({
  chapter: "", narration: "", subtitle: "", visual_type: "keyword", heading: "", items: [], mermaid: "",
  compare: [], compare_titles: [], x_axis: "", y_axis: "", quadrants: [], quote_author: "", source_refs: [], ...p,
});

const q = (s: string) => `"${s.replace(/"/g, "").replace(/[()（）;；]/g, " ").slice(0, 22)}"`;

/** 重要ポイント/概念から概念マップ(mermaid)を作る。画面を図にして文字を減らす。 */
function conceptMap(center: string, nodes: string[]): string {
  const lines = ["flowchart TD", `  C[${q(center)}]`];
  nodes.slice(0, 6).forEach((n, i) => lines.push(`  C --> N${i}[${q(n)}]`));
  return lines.join("\n");
}

/**
 * 既存の要約＋ビジュアルから動画シーンを組み立てる。
 * 方針(§13)：画面は図とキーワードだけ。詳しい説明はナレーション(音声)に載せ、字幕は短く。
 */
export function buildVideoScenes(a: Analysis, visuals: VisualBlockT[] | null, length: 5 | 10 | 20, title: string, authors: string): Scene[] {
  const out: Scene[] = [];
  const nPoints = length === 5 ? 3 : 5;
  const nConcepts = length === 5 ? 0 : length === 10 ? 4 : 6;
  const vis = visuals ?? [];

  // タイトル
  out.push(s({ chapter: "はじめに", visual_type: "title", heading: title, subtitle: authors, narration: `${title}。${a.brief30.one_liner}` }));
  // 中核の問い（キーワード1枚）
  out.push(s({ visual_type: "keyword", heading: "この本が答える問い", subtitle: "問題提起", narration: a.detail.central_question }));

  // この本の全体像＝概念マップ（図解）
  out.push(s({ chapter: "全体像", visual_type: "conceptmap", heading: "この本の地図", mermaid: conceptMap(title, a.key_points.map((p) => p.title)), subtitle: "重要ポイントのつながり", narration: `この本の重要な考えは大きく${Math.min(nPoints, a.key_points.length)}つ。まずは全体像から見てみましょう。` }));

  // 一番大事（キーワード1枚・本文はナレーションへ）
  out.push(s({ chapter: "この本の核心", visual_type: "keyword", heading: "一番大事なこと", subtitle: a.most_important.message.slice(0, 22), narration: `結局この本で一番大事なのは。${a.most_important.message}。${a.most_important.explanation}` }));

  // 重要ポイント：画面はキーワードのみ、本文は全部ナレーション（＝文字を減らす）
  a.key_points.slice(0, nPoints).forEach((p, i) => {
    out.push(s({ chapter: i === 0 ? "重要ポイント" : "", visual_type: "keyword", heading: p.title, subtitle: `ポイント ${i + 1}／${nPoints}`, narration: `${i + 1}つ目。${p.title}。${p.body}`, source_refs: p.evidence }));
  });

  // 重要概念（10/20分）：概念マップ＋各概念キーワード
  if (nConcepts > 0) {
    const cs = a.brief180.concepts.slice(0, nConcepts);
    out.push(s({ chapter: "重要概念", visual_type: "conceptmap", heading: "重要概念のつながり", mermaid: conceptMap("重要概念", cs.map((c) => c.name)), subtitle: "概念マップ", narration: `この本のカギになる概念を見ていきます。` }));
    if (length === 20) cs.forEach((c) => out.push(s({ visual_type: "keyword", heading: c.name, subtitle: "重要概念", narration: `${c.name}。${c.description}`, source_refs: c.evidence })));
    else out.push(s({ visual_type: "keyword", heading: cs[0].name, subtitle: "特に重要な概念", narration: cs.map((c) => `${c.name}。${c.description}`).join(" ") }));
  }

  // 図解チャプター：ビジュアルを全部シーン化（比較・2×2・プロセス）＋本文の図解も全部
  const diagramScenes: Scene[] = [];
  for (const v of vis) {
    if (v.kind === "comparison" && v.comparison_rows.length)
      diagramScenes.push(s({ visual_type: "comparison", heading: v.title, compare: v.comparison_rows, compare_titles: [v.left_title, v.right_title], subtitle: v.title.slice(0, 22), narration: `${v.title}。${v.caption}` }));
    else if (v.kind === "matrix2x2" && v.quadrants.length === 4)
      diagramScenes.push(s({ visual_type: "matrix", heading: v.title, x_axis: v.x_axis, y_axis: v.y_axis, quadrants: v.quadrants, subtitle: v.title.slice(0, 22), narration: `${v.title}。${v.caption}` }));
    else if (v.kind === "steps" && v.steps.length)
      diagramScenes.push(s({ visual_type: "timeline", heading: v.title, items: v.steps.map((x) => x.label), subtitle: v.title.slice(0, 22), narration: `${v.title}。${v.caption}。${v.steps.map((x) => x.label).join("、")}` }));
    else if (v.kind === "checklist" && v.checklist.length)
      diagramScenes.push(s({ visual_type: "timeline", heading: v.title, items: v.checklist, subtitle: v.title.slice(0, 22), narration: `${v.title}。${v.caption || v.checklist.join("、")}` }));
    else if (v.kind === "stats" && v.stats.length)
      diagramScenes.push(s({ visual_type: "stat", heading: v.title, items: v.stats.map((x) => `${x.value}｜${x.label}`), subtitle: v.title.slice(0, 22), narration: `${v.title}。${v.caption}` }));
  }
  a.diagrams.forEach((d) => diagramScenes.push(s({ visual_type: "flowchart", heading: d.title, mermaid: d.mermaid, subtitle: d.title.slice(0, 22), narration: `${d.title}。${d.caption}` })));
  // 尺で図解の数を調整（5分は3枚、10分は6枚、20分は全部）
  const maxDiagrams = length === 5 ? 4 : length === 10 ? 8 : diagramScenes.length;
  diagramScenes.slice(0, maxDiagrams).forEach((sc, i) => out.push({ ...sc, chapter: i === 0 ? "図解で理解する" : "" }));

  // 具体例（1枚に凝縮・ナレーション中心）
  if (a.brief180.examples.length) {
    out.push(s({ chapter: "具体例", visual_type: "keyword", heading: "具体例で見る", subtitle: "たとえば", narration: a.brief180.examples.slice(0, length === 5 ? 1 : 2).join("。 次に。 ") }));
  }

  // 20分：批判（2×2やmatrixが無ければキーワード＋ナレーション）
  if (length === 20 && a.detail.critiques.length) {
    out.push(s({ chapter: "批判と限界", visual_type: "keyword", heading: "この本への批判", subtitle: "限界も知る", narration: a.detail.critiques.slice(0, 2).join("。") }));
  }

  // まとめ
  out.push(s({ chapter: "まとめ", visual_type: "keyword", heading: "結論", subtitle: a.detail.conclusion.slice(0, 22), narration: `まとめます。${a.detail.conclusion}` }));
  out.push(s({ visual_type: "keyword", heading: "今日から使える1つ", subtitle: a.today_action.action.slice(0, 22), narration: `最後に、今日から使えることを1つ。${a.today_action.action}。${a.today_action.why}` }));
  out.push(s({ visual_type: "title", heading: "以上、解説でした", subtitle: "下の要約と質問も使えます", narration: `以上、${title}の解説でした。気になったところは、下の質問機能で聞いてみてください。` }));
  return out;
}
