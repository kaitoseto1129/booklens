import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL, EFFORT, addUsage, emptyUsage } from "./client";
import { GROUNDING_RULES } from "./prompts";
import { PersonaSchema, CompareSchema, QuizSchema, LibraryAnswerSchema, type Persona, type Compare, type Quiz, type LibraryAnswer, type Analysis } from "./schemas";

function sys(...blocks: string[]): Anthropic.TextBlockParam[] {
  return blocks.map((text, i) => (i === 0 ? { type: "text", text, cache_control: { type: "ephemeral", ttl: "1h" } } : { type: "text", text }));
}

/** #4 自分向け要約 */
export async function personaSummary(evidence: string, analysis: Analysis, persona: string): Promise<Persona> {
  const usage = emptyUsage();
  const res = await claude().messages.parse({
    model: MODEL, max_tokens: 6000, thinking: { type: "disabled" },
    output_config: { effort: EFFORT, format: zodOutputFormat(PersonaSchema) },
    system: sys(evidence, `${GROUNDING_RULES}\n\n# TASK\nこの本を「${persona}」の視点で再構成する。全部ではなく、その立場に効く部分だけ。BOOKの範囲内で。日本語。`),
    messages: [{ role: "user", content: `# 既存の要約\n${JSON.stringify(analysis, null, 1)}\n\n「${persona}」向けに再構成して。` }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("persona: failed");
  return res.parsed_output;
}

/** #7 本の比較 */
export async function compareBooks(items: { title: string; evidence: string; analysis: Analysis }[]): Promise<Compare> {
  const usage = emptyUsage();
  const body = items.map((it) => `## ${it.title}\n${it.evidence}\n\n[要約]\n${JSON.stringify(it.analysis, null, 1)}`).join("\n\n---\n\n");
  const res = await claude().messages.parse({
    model: MODEL, max_tokens: 8000, thinking: { type: "disabled" },
    output_config: { effort: EFFORT, format: zodOutputFormat(CompareSchema) },
    system: sys(`${GROUNDING_RULES}\n\n# TASK\n次の複数の本を比較する。共通点・観点ごとの違い・矛盾・読む順・目的別おすすめ。各本の根拠と要約の範囲内で。日本語。`),
    messages: [{ role: "user", content: body }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("compare: failed");
  return res.parsed_output;
}

/** #9 クイズ */
export async function makeQuiz(evidence: string, analysis: Analysis): Promise<Quiz> {
  const usage = emptyUsage();
  const res = await claude().messages.parse({
    model: MODEL, max_tokens: 4000, thinking: { type: "disabled" },
    output_config: { effort: EFFORT, format: zodOutputFormat(QuizSchema) },
    system: sys(evidence, `${GROUNDING_RULES}\n\n# TASK\nこの本の重要概念の定着を測る3択（または4択）クイズを3問。情報源で確認できる内容のみ。日本語。`),
    messages: [{ role: "user", content: `# 要約\n${JSON.stringify(analysis, null, 1)}\n\nクイズを3問。` }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("quiz: failed");
  return res.parsed_output;
}

/** #8 横断Q&A（自分の本棚） */
export async function askLibrary(question: string, books: { title: string; analysis: Analysis }[]): Promise<LibraryAnswer> {
  const usage = emptyUsage();
  const shelf = books.map((b) => `## ${b.title}\n一番大事: ${b.analysis.most_important.message}\n概念: ${b.analysis.brief180.concepts.map((c) => c.name).join(", ")}\n要点: ${b.analysis.key_points.map((p) => p.title).join(" / ")}\n主張: ${b.analysis.detail.claims.join(" / ")}`).join("\n\n");
  const res = await claude().messages.parse({
    model: MODEL, max_tokens: 6000, thinking: { type: "disabled" },
    output_config: { effort: EFFORT, format: zodOutputFormat(LibraryAnswerSchema) },
    system: sys(`# USER'S BOOKSHELF (読んだ本の要約)\n${shelf}`, `${GROUNDING_RULES}\n\n# TASK\nユーザーの本棚の内容だけを根拠に、質問へ横断的に答える。どの本由来かを示す。本棚に無いことは推測せずnoteに書く。日本語。`),
    messages: [{ role: "user", content: `# 質問\n${question}` }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("askLibrary: failed");
  return res.parsed_output;
}

import { VideoSchema, type Video } from "./schemas";

/** 動画台本（シーン列）をAI生成。§3,§7-10 の授業型構成・話し言葉。 */
export async function generateVideo(evidence: string, analysis: Analysis, length: 5 | 10 | 20): Promise<Video> {
  const usage = emptyUsage();
  const target = { 5: "12〜18", 10: "24〜32", 20: "40〜55" }[length];
  const res = await claude().messages.parse({
    model: MODEL, max_tokens: 16000, thinking: { type: "disabled" },
    output_config: { effort: EFFORT, format: zodOutputFormat(VideoSchema) },
    system: sys(evidence, `${GROUNDING_RULES}

# TASK
この本の${length}分の解説動画の台本（シーン列）を作る。授業のように理解できる流れ：問題提起→テーマ→重要概念→具体例→図解→結論→応用。
- シーン数の目安：${target}個。
- narration は話し言葉。要約文の棒読みにしない。問いかけ・たとえを使う（§10）。
- subtitle は画面に出す短い1行（20字前後）。
- **図解を主役にする（重要）**：画面は図とキーワードだけにし、詳しい説明はすべて narration（音声）に載せる。文字を並べたスライドにしない（§13）。
- visual_type は図解系（flowchart / conceptmap / comparison / matrix / timeline）を優先。bullets と長文キーワードは最小限。重要ポイントや概念は、できるだけ図（概念マップ・因果・比較・2×2）に変換する。
- 図解の目安：全シーンの半分以上を図解系にする。
- **本の代名詞となる中心フレームワークは必ず専用の図解シーンにして、大きく主役として見せる**（例：顧客起点マーケティングなら「顧客ピラミッド（5セグ）」「9セグマップ」、Thinking in Betsなら「決断の質×結果の質」の2×2）。文章やキーワードで済ませない。該当する枠組みが情報源にあれば、matrix / flowchart / conceptmap / comparison のいずれかで必ず1シーン以上入れる。
- そのフレームワークの図には、構成要素（ピラミッドの各段、マップの各象限など）をノード/セル/行として具体的に描く。
- flowchart/conceptmap は Mermaid（ラベルは必ずダブルクォート、ラベル内に丸括弧や;を入れない）。matrix は x_axis/y_axis と quadrants[4]（[左上,右上,左下,右下]）。comparison は compare_titles[2] と compare[]。
- 図は中学生が一目で理解できることを最優先にする：
  ・ラベルは専門用語を避け、日常のことばで書く。専門語が必要なら「専門語＝やさしい言い換え」の形にする。
  ・1つの図は1つの関係だけを表す（原因→結果／前→後／全体→部分／AとBの対比 のどれか一つ）。詰め込まない。
  ・ノードは6個以内、各ラベルは15字以内、できれば一言。
  ・矢印は関係が伝わるように使う（枝分かれや対立が分かるように）。
  ・captionは「この図がいちばん言いたいこと」を中学生向けに1文で。可能なら身近なたとえを1つ入れる。
- chapter は章の先頭シーンにだけタイトルを入れる。
- 情報源の範囲内のみ。数値や具体例を捏造しない。日本語。`),
    messages: [{ role: "user", content: `# 既存の要約\n${JSON.stringify(analysis, null, 1)}\n\n${length}分の動画台本を作って。` }],
  });
  addUsage(usage, res);
  if (!res.parsed_output) throw new Error("video: failed");
  return res.parsed_output;
}
