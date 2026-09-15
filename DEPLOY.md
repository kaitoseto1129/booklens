# BookLens デプロイ手順

このアプリは **長時間の生成（1冊5〜10分）** と **SQLite(node:sqlite) のファイル保存** を使う。
そのため Vercel（サーバーレス・FS非永続）より、**永続ボリュームを持てるコンテナ host** が向いている。
DBの書き換えは不要。同梱の `Dockerfile` をそのまま使う。

## 事前準備（自分のMacで）
```bash
# 受け取った booklens.tar.gz を展開したフォルダで
npm install
cp .env.example .env.local     # ANTHROPIC_API_KEY を記入して手元テスト
npm run dev                    # http://localhost:3000
```

## GitHubに上げる
```bash
git init && git add -A && git commit -m "BookLens"
# GitHubで空リポジトリを作成し、そのURLで：
git remote add origin https://github.com/<あなた>/booklens.git
git branch -M main && git push -u origin main
```

## デプロイ（Railway が最も簡単）
1. https://railway.app → New Project → Deploy from GitHub repo → このリポジトリ
2. Railway が `Dockerfile` を自動検出してビルド
3. **Variables** に環境変数を設定
   - `ANTHROPIC_API_KEY`（必須）
   - `BOOKLENS_PASSWORD`（推奨）＝ 好きな合言葉。設定するとサイト全体にパスワードがかかり、知っている人（お父さん）だけ使える。**公開リンクで勝手に使われて課金されるのを防ぐ**。ブラウザのログイン欄はユーザー名は空でOK、パスワード欄にこの合言葉。
   - 任意：`BOOKLENS_MODEL=claude-sonnet-5`（安くする）, `GOOGLE_BOOKS_API_KEY`
4. **Volumes** で新規ボリュームを作り、マウント先を **`/data`** に（要約データの永続化。これがないと再起動で消える）
5. 生成される公開URL（例 `https://booklens-production.up.railway.app`）が「リンク」

※ Render / Fly.io でも同様（Dockerfile＋`/data`ボリューム＋環境変数）。

## 注意
- `ANTHROPIC_API_KEY` は必ず host の環境変数に。コードやスクショに置かない。
- 露出済みの旧キーは Console で削除→再発行。
- コスト: Opus 5 で約$2.5-3/冊。`BOOKLENS_MODEL=claude-sonnet-5` で削減可。
