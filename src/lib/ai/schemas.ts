import { z } from "zod";

// 出力は日本語。数値の範囲は description で指示（構造化出力のスキーマ制約は最小限にする）。
const Point = z.object({
  title: z.string().describe("見出し（20字以内）"),
  body: z.string().describe("説明（2〜4文）"),
  importance: z.number().int().describe("重要度 1〜5（5=必須, 4=重要, 3=補足, 2=具体例, 1=読み飛ばし可）"),
  evidence: z.array(z.string()).describe("根拠にした情報源の参照ID（例: S1, S3）。根拠がなければ空配列"),
});

const Concept = z.object({
  name: z.string().describe("概念名（原語があれば併記。例: Resulting（結果論））"),
  description: z.string().describe("1〜3文の説明"),
  importance: z.number().int().describe("重要度 1〜5"),
  evidence: z.array(z.string()).describe("情報源の参照ID"),
});

const Chapter = z.object({
  number: z.number().int(),
  title: z.string(),
  summary: z.string().describe("その章の内容。情報源で確認できた範囲のみ。不明なら『詳細は確認できませんでした』と書く"),
});

const Diagram = z.object({
  title: z.string(),
  caption: z.string().describe("図の読み方を1〜2文で"),
  mermaid: z
    .string()
    .describe(
      "Mermaid記法。flowchart TD / flowchart LR / mindmap のいずれか。ノードのラベルは必ずダブルクォートで囲む（例: A[\"結果\"] --> B[\"判断の質\"]）。日本語可。1図あたりノード12個以内。",
    ),
});

// 大きな1スキーマは strict-JSON のグラマー上限を超えるため、3つに分割して生成しマージする。
export const AnalysisCoreSchema = z.object({
  brief30: z.object({
    one_liner: z.string().describe("この本を一言で（1〜2文）"),
    top3: z.array(Point).describe("最重要ポイント3つ"),
    for_whom: z.string().describe("誰におすすめか（1〜2文）"),
  }),
  most_important: z.object({
    message: z.string().describe("この本で一番大事なこと（1文）"),
    explanation: z.string().describe("簡単な説明（2〜3文）"),
  }),
  key_points: z.array(Point).describe("重要ポイント5つ（brief30.top3と重複してよいが表現は独立させる）"),
  today_action: z.object({
    action: z.string().describe("今日から使える1つ（具体的な行動）"),
    why: z.string().describe("なぜそれが効くか（1〜2文）"),
  }),
  action_items: z.array(z.string()).describe("この本を読んだ後にやること3つ"),
  why_care: z.string().describe("なぜこの本が重要か。この考えを知ると何が変わるか（3〜5文）"),
});

export const AnalysisDepthSchema = z.object({
  brief180: z.object({
    problem: z.string().describe("この本の問題意識"),
    conclusion: z.string().describe("著者の結論"),
    concepts: z.array(Concept).describe("重要概念5〜8個"),
    examples: z.array(z.string()).describe("代表的な具体例（情報源で確認できたもののみ）"),
    takeaways: z.array(z.string()).describe("読者が持ち帰るべきこと 3〜5個"),
  }),
  detail: z.object({
    background: z.string().describe("本の背景（出版の文脈・なぜ書かれたか）"),
    about_author: z.string().describe("著者について"),
    central_question: z.string().describe("中心的な問い"),
    claims: z.array(z.string()).describe("著者の主張（箇条書き）"),
    concepts: z.array(Concept).describe("重要概念（詳細版）"),
    examples: z.array(z.string()).describe("具体例（詳細版）"),
    chapters: z.array(Chapter).describe("章構成。目次が情報源にある場合のみ。無ければ空配列"),
    chapters_verified: z.boolean().describe("章構成が情報源の目次で確認できたか"),
    chapters_note: z.string().describe("章情報についての注記（例: 『章ごとの詳細情報は十分取得できませんでした』）"),
    conclusion: z.string().describe("最終結論"),
    critiques: z.array(z.string()).describe("批判・限界（情報源で確認できた論点。無ければ空）"),
    applications: z.array(z.string()).describe("応用方法"),
  }),
});

export const AnalysisExtrasSchema = z.object({
  ai_insight: z.object({
    applications: z.array(z.string()).describe("AIによる応用・解釈（本に書かれていないことはここに置く）"),
    counterarguments: z.array(z.string()).describe("この本への反論・弱点（AIの見解として。情報源に無いものはここ）"),
    evidence_check: z.string().describe("著者の主張と現在の研究での支持状況の違い（分かる範囲で。断定しない）"),
  }),
  diagrams: z.array(Diagram).describe("図解3〜5個：①概念マップ ②中心的なフレームワーク/プロセス ③比較や構造 ④因果/相関 ⑤タイムラインや段階（本に合うものを）。多めに。"),
  narration: z.array(z.object({ title: z.string().describe("スライド見出し（短く）"), script: z.string().describe("話し言葉の台本（2〜4文、耳で聞いて分かる表現）") })).describe("動画解説の台本。8〜12スライド：導入→一番大事→重要ポイント各→今日から→締め。忙しい人が2〜3分で聞き流せる流れ。"),
  quotes: z.array(z.object({ text: z.string(), evidence: z.string() })).describe("短い引用（各40語/80字以内、最大4つ）。情報源に実際にある文のみ。無ければ空"),
  unverified: z.array(z.string()).describe("確認できなかった事項（正直に列挙）"),
  conflicts: z.array(z.string()).describe("情報源によって説明が異なる点"),
});

export type AnalysisCore = z.infer<typeof AnalysisCoreSchema>;
export type AnalysisDepth = z.infer<typeof AnalysisDepthSchema>;
export type AnalysisExtras = z.infer<typeof AnalysisExtrasSchema>;
export type Analysis = AnalysisCore & AnalysisDepth & AnalysisExtras;

export const QuickSchema = z.object({
  one_liner: z.string(),
  top3: z.array(z.object({ title: z.string(), body: z.string() })),
  for_whom: z.string(),
  note: z.string().describe("この速報版の限界（例: 出版社紹介文と百科事典の記述のみに基づく）"),
});
export type Quick = z.infer<typeof QuickSchema>;

export const QASchema = z.object({
  groundedness: z.number().int().describe("0〜100。要約の記述がどれだけ情報源に裏付けられているか"),
  coverage: z.number().int().describe("0〜100。情報源にある主要テーマをどれだけ網羅しているか"),
  consistency: z.number().int().describe("0〜100。要約内部と情報源との整合性"),
  hallucination_risk: z.number().int().describe("0〜100。高いほど危険（捏造の疑い）"),
  issues: z.array(
    z.object({
      section: z.string().describe("該当箇所（例: detail.chapters, key_points[2]）"),
      problem: z.string(),
      severity: z.enum(["high", "medium", "low"]),
      fix: z.string().describe("どう直すべきか"),
    }),
  ),
  verdict: z.enum(["accept", "revise"]),
});
export type QA = z.infer<typeof QASchema>;

export const SourceListSchema = z.object({
  sources: z.array(
    z.object({
      ref: z.string().describe("S1, S2..."),
      type: z.enum(["publisher", "author", "toc", "preview", "review", "interview", "library", "wiki", "fulltext", "other"]),
      title: z.string(),
      url: z.string().nullable(),
      tier: z.number().int().describe("1〜4"),
      summary: z.string().describe("この情報源から得た内容の要点（2〜3文）"),
    }),
  ),
  toc_found: z.boolean(),
  primary_source_count: z.number().int().describe("Tier1の情報源数"),
});

/** Pass 1：根拠資料からの構造化抽出（§12）。要約はこの抽出＋dossierから書く。 */
export const ExtractionSchema = z.object({
  people: z.array(z.object({ name: z.string(), role: z.string(), evidence: z.array(z.string()) })).describe("著者・登場する人物・引用される研究者など"),
  concepts: z.array(z.object({ name: z.string(), definition: z.string(), evidence: z.array(z.string()), support_count: z.number().int().describe("何個の独立した情報源が言及しているか") })),
  claims: z.array(z.object({ claim: z.string(), evidence: z.array(z.string()), tier_best: z.number().int().describe("裏付ける最良の情報源のTier（1〜4）"), importance: z.number().int().describe("1〜100") })),
  chapters: z.array(z.object({ number: z.number().int(), title: z.string(), evidence: z.array(z.string()), known_content: z.string().describe("その章について情報源から分かること。無ければ空文字") })).describe("目次が情報源にある場合のみ。無ければ空配列"),
  examples: z.array(z.object({ summary: z.string(), evidence: z.array(z.string()) })).describe("情報源が実際に述べている具体例・エピソード・データ"),
  conclusions: z.array(z.object({ text: z.string(), evidence: z.array(z.string()) })),
  reception: z.array(z.object({ text: z.string(), stance: z.enum(["praise", "critique", "mixed"]), evidence: z.array(z.string()) })),
  gaps: z.array(z.string()).describe("情報源から分からないこと"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** 可視化ブロック（表・2×2・プロセス・比較・数値・チェックリスト）。文章ではなく構造で見せる。 */
const VisualBlock = z.object({
  kind: z.enum(["table", "matrix2x2", "steps", "comparison", "stats", "checklist"]).describe("この図の種類"),
  title: z.string().describe("見出し"),
  caption: z.string().describe("この図/表の読み方・意味を1〜2文で"),
  evidence: z.array(z.string()).describe("根拠の情報源ref（S1等）。無ければ空"),
  // kind=table
  columns: z.array(z.string()).describe("kind=table の列見出し。それ以外は空配列"),
  rows: z.array(z.array(z.string())).describe("kind=table の各行（要素数は columns と一致）。それ以外は空配列"),
  // kind=matrix2x2（例：横軸=結果の質、縦軸=決断の質）
  x_axis: z.string().describe("kind=matrix2x2 の横軸ラベル。それ以外は空文字"),
  y_axis: z.string().describe("kind=matrix2x2 の縦軸ラベル。それ以外は空文字"),
  quadrants: z
    .array(z.object({ label: z.string(), items: z.array(z.string()) }))
    .describe("kind=matrix2x2 のとき必ず4要素の順で: [左上, 右上, 左下, 右下]。それ以外は空配列"),
  // kind=steps（順序のあるプロセス）
  steps: z.array(z.object({ label: z.string(), detail: z.string() })).describe("kind=steps の手順。それ以外は空配列"),
  // kind=comparison（A vs B）
  left_title: z.string().describe("kind=comparison の左側の名前。それ以外は空文字"),
  right_title: z.string().describe("kind=comparison の右側の名前。それ以外は空文字"),
  comparison_rows: z
    .array(z.object({ aspect: z.string(), left: z.string(), right: z.string() }))
    .describe("kind=comparison の比較観点ごとの行。それ以外は空配列"),
  // kind=stats（キー数値の強調）
  stats: z.array(z.object({ value: z.string(), label: z.string() })).describe("kind=stats の数値。それ以外は空配列"),
  // kind=checklist（実践チェック項目）
  checklist: z.array(z.string()).describe("kind=checklist の項目。それ以外は空配列"),
});

export const VisualsSchema = z.object({
  visuals: z
    .array(VisualBlock)
    .describe("4〜7個。table / matrix2x2 / steps / comparison / stats / checklist を目的に応じて組み合わせる。全て情報源・要約の範囲内で。"),
});
export type Visuals = z.infer<typeof VisualsSchema>;
export type VisualBlockT = z.infer<typeof VisualBlock>;

/** 答えファースト検索：悩み→複数の本から共通する答え＋根拠の本。 */
export const AnswerSchema = z.object({
  question: z.string().describe("ユーザーの問いを一文で整理"),
  headline: z.string().describe("結論を一言で（1〜2文）"),
  points: z.array(z.object({
    point: z.string().describe("答えの要点（短く言い切る）"),
    detail: z.string().describe("1〜2文の補足"),
    books: z.array(z.string()).describe("この要点を述べている本のタイトル（複数可）"),
  })).describe("複数の本に共通する答え 4〜6個。合意度の高い順。"),
  books: z.array(z.object({
    title: z.string(),
    author: z.string(),
    isbn13: z.string().nullable().describe("確認できた場合のみ。無ければnull"),
    why: z.string().describe("この問いに対してこの本がなぜ役立つか（1文）"),
  })).describe("根拠になった本 3〜5冊。名著・定番を優先。"),
  caveat: z.string().describe("注意点や、状況によって答えが変わる点（1〜2文）"),
});
export type AnswerResult = z.infer<typeof AnswerSchema>;

/** #4 自分向け要約：職業・立場に合わせて再構成 */
export const PersonaSchema = z.object({
  persona_label: z.string().describe("対象（例: 経営者）"),
  focus: z.string().describe("この立場の人にとって、この本のどこが効くか（1〜2文）"),
  points: z.array(z.object({ title: z.string(), body: z.string().describe("その立場での具体的な意味・使い方（2〜3文）") })).describe("この立場に関係する要点 3〜5個"),
  actions: z.array(z.string()).describe("この立場で今日からできること 3個"),
  skip: z.array(z.string()).describe("この立場なら読み飛ばしてよい部分（あれば）"),
});
export type Persona = z.infer<typeof PersonaSchema>;

/** #7 本の比較 */
export const CompareSchema = z.object({
  titles: z.array(z.string()),
  tldr: z.string().describe("一言でどう違うか（1〜2文）"),
  common: z.array(z.string()).describe("共通して主張していること"),
  differences: z.array(z.object({ aspect: z.string().describe("観点"), positions: z.array(z.object({ book: z.string(), stance: z.string() })) })).describe("観点ごとの立場の違い 3〜6個"),
  disagreements: z.array(z.string()).describe("互いに反対・矛盾する点（あれば）"),
  which_first: z.string().describe("どれから読むべきか＋理由"),
  use_cases: z.array(z.object({ situation: z.string(), pick: z.string() })).describe("目的別おすすめ"),
});
export type Compare = z.infer<typeof CompareSchema>;

/** #9 クイズ */
export const QuizSchema = z.object({
  questions: z.array(z.object({
    question: z.string(),
    choices: z.array(z.string()).describe("選択肢3〜4個"),
    answer_index: z.number().int().describe("正解の選択肢の番号（0始まり）"),
    explanation: z.string().describe("なぜそれが正解か（1〜2文）"),
  })).describe("この本の重要概念を問う3問"),
});
export type Quiz = z.infer<typeof QuizSchema>;

/** #8 横断Q&A（自分の本棚に質問） */
export const LibraryAnswerSchema = z.object({
  headline: z.string().describe("結論を一言で"),
  points: z.array(z.object({ point: z.string(), detail: z.string(), books: z.array(z.string()).describe("この点を述べている、ユーザーが読んだ本のタイトル") })).describe("横断してまとめた要点 3〜6個"),
  synthesis: z.string().describe("複数の本を統合した見解（2〜4文）"),
  note: z.string().describe("本棚に十分な情報が無い場合の注記（あれば）"),
});
export type LibraryAnswer = z.infer<typeof LibraryAnswerSchema>;

/** 動画解説：シーン列（§11,§53）。ブラウザ内でテンプレ再生する。 */
const VideoScene = z.object({
  chapter: z.string().describe("このシーンから新しい章が始まる場合の章タイトル。途中のシーンは空文字"),
  narration: z.string().describe("ナレーション（話し言葉・問いかけ・例え。§10）。字幕より長くてよい"),
  subtitle: z.string().describe("画面に出す短い字幕（1行・20字前後）"),
  visual_type: z.enum(["title", "keyword", "bullets", "flowchart", "comparison", "timeline", "quote", "stat", "matrix", "conceptmap"]).describe("このシーンの見せ方。図解（flowchart/comparison/timeline/matrix/conceptmap）を優先し、keyword/bulletsは最小限に。"),
  heading: z.string().describe("画面中央の見出し／キーワード（visual_type=title/keyword/quote等）。無ければ空文字"),
  items: z.array(z.string()).describe("bullets/timelineの項目。それ以外は空配列"),
  mermaid: z.string().describe("flowchart のときの Mermaid（ラベルは必ずダブルクォート、ノード12個以内）。それ以外は空文字"),
  compare: z.array(z.object({ aspect: z.string(), left: z.string(), right: z.string() })).describe("comparison のときの比較行。それ以外は空配列"),
  compare_titles: z.array(z.string()).describe("comparison のとき[左, 右]の名前。それ以外は空配列"),
  x_axis: z.string().describe("matrix のとき横軸ラベル。それ以外は空文字"),
  y_axis: z.string().describe("matrix のとき縦軸ラベル。それ以外は空文字"),
  quadrants: z.array(z.object({ label: z.string(), items: z.array(z.string()) })).describe("matrix のとき4要素[左上,右上,左下,右下]。それ以外は空配列"),
  quote_author: z.string().describe("quote のとき出典（著者・書名）。それ以外は空文字"),
  source_refs: z.array(z.string()).describe("根拠の情報源ref"),
});

export const VideoSchema = z.object({
  length_min: z.number().int().describe("目標の長さ（分）"),
  scenes: z.array(VideoScene).describe("シーン列。授業のように問題提起→テーマ→重要概念→具体例→図解→結論→応用の流れ（§3）。"),
});
export type Video = z.infer<typeof VideoSchema>;
export type VideoSceneT = z.infer<typeof VideoScene>;
