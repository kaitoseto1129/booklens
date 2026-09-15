# BookLens

本のタイトルを入れるだけで、その本の重要部分を短時間で理解するための Web サービス（Phase 1 MVP）。

## セットアップ

```bash
cp .env.example .env.local   # ANTHROPIC_API_KEY を記入
npm install
npm run dev                  # http://localhost:3000
```

Node は `~/.local/node/bin` を使う場合 `sh scripts/dev.sh` でも起動できます。

## 仕組み（要件定義書との対応）

| 要件 | 実装 |
|---|---|
| 書籍特定・ISBN管理（§7-8） | Open Library（世界）＋ 国立国会図書館サーチ（日本）を並列検索し、題名一致でフィルタ。見つからなければ **AIでWeb検索**（Claude web_search）で特定。ISBN があれば openBD / NDL / OL で書誌を補完。`books` は ISBN-13 / OL work key で重複排除 |
| A/B 判定（§3） | Project Gutenberg に本文があれば **A**（本文を主要情報源に）。無ければ **B** |
| 情報取得パイプライン（§9） | `src/lib/pipeline.ts`：書誌 → 公式情報/目次/百科事典の事前取得 → 速報版 → 本文判定 → Web 収集（Claude の web_search / web_fetch）→ 情報源整理 → 要約生成 → 事実確認 → 必要なら再生成 → 保存 |
| 「AIに知識だけで答えさせない」（§6, §13） | 要約は必ず **根拠 dossier** をシステムプロンプトに入れて生成。目次が無ければ章を作らない、確認できない点は `unverified` に出す |
| ソース優先順位・照合（§10-11） | 情報源に Tier 1〜4 を付与。Tier 4 だけを根拠に主要主張を作らない。食い違いは `conflicts` に |
| 複数パス生成・品質評価（§12, §42） | Pass 1 抽出（人物・概念・主張・章・具体例・結論・評価をS-ref付きで構造化）→ 要約生成（抽出をチェックリストに）→ 独立した事実確認（Groundedness / Coverage / Consistency / Hallucination Risk）→ `revise` なら前稿＋指摘を渡して書き直し（最大2回） |
| 情報不足時の追加調査 | 目次が無い / 一次情報が2件未満なら、欠けているものだけを狙った追加 Web 調査（gap-fill）を1回実行 |
| 所要時間の見える化（§53） | 各ステップの開始/終了を `timeline` に記録し、`step_stats` に実績平均を蓄積。UI は「経過 1:48 · 残り約8分」＋工程リスト（✓済み/●進行中/○予定と所要時間）。トップにも「速報版 約N秒 / 完全版 約N分」を表示 |
| 精度表示（§4-5, §43） | `computeConfidence()`：Aタイプ=非常に高い / 目次＋一次情報複数=高い / 標準 / 限定的。UIは「情報精度：高い 82%」 |
| 30秒 / 3分 / 詳細 / 重要ポイント5 / 一番大事 / 今日から使える / Why care（§14-18, §34-35, §60） | `BookView.tsx` のタブとカード |
| BOOK と AI INSIGHT の分離（§63） | スキーマ上で分離し、UI にタグ表示 |
| 図解 | 要約と同時に Mermaid 図を 2〜3 個生成し、ブラウザで描画（概念マップ・フレームワーク図）。描画に失敗したら `/api/diagram/fix` で1回だけ AI 修復 → それでもダメならノード一覧にフォールバック |
| AI質問（§22） | `/api/books/[id]/ask`：根拠 dossier ＋ 要約をプロンプトキャッシュしてストリーミング回答 |
| My Library（§29） | `user_books`（ログインなし・単一ユーザー） |
| キャッシュ / バージョン（§40-41） | 一度生成した本は DB から即表示。「最新情報で再生成」で version を上げる |
| 修正報告（§44） | 「内容が違う」→ `reports` テーブル |
| 非同期生成（§54） | 事前取得情報だけで **速報版** を先に表示し、本番要約完了で差し替え |

## 未実装（Phase 2 以降）

- ユーザー認証・複数ユーザー、PostgreSQL への移行（DB 層は `src/lib/db.ts` に閉じている）
- ユーザーの手持ちファイル（PDF/EPUB）アップロードによる A タイプ
- Vector DB / チャンク検索（現状は 1 冊分の根拠を丸ごとコンテキストに入れる方式）
- 書籍比較、Knowledge Map、クイズ／間隔反復、パーソナライズ、次に読む本
- 管理画面、課金

## 構成

- Next.js 16 (App Router) / TypeScript / Tailwind v4
- DB: `node:sqlite`（`data/booklens.db`）
- AI: `@anthropic-ai/sdk`（`claude-opus-5`、adaptive thinking、structured outputs、web_search / web_fetch、prompt caching）
- 図解: mermaid
- 書誌: Open Library / 国立国会図書館サーチ / openBD / Wikipedia / Project Gutenberg（Gutendex）/ Google Books（鍵がある時のみ）
- 日本の本の表紙：openBD → Open Library → Amazon の ISBN-10 画像パターン（フォールバック。公開時は正規の画像ソースに置き換えること）
