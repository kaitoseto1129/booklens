#!/bin/sh
# ローカル開発サーバー起動（~/.local/node にある Node を使う）
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.." && exec npm run dev
