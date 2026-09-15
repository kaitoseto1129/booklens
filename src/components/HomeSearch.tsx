"use client";
import { useState } from "react";
import SearchBox from "./SearchBox";
import AnswerSearch from "./AnswerSearch";

export default function HomeSearch() {
  const [mode, setMode] = useState<"answer" | "book">("answer");
  return (
    <div>
      <div className="flex justify-center mb-5">
        <div className="inline-flex p-1 rounded-full bg-bg-tint border border-line/70 text-sm">
          <button onClick={() => setMode("answer")} className={`rounded-full px-4 py-1.5 transition-colors ${mode === "answer" ? "bg-card text-fg font-medium shadow-sm" : "text-muted hover:text-fg"}`}>💡 答えを探す</button>
          <button onClick={() => setMode("book")} className={`rounded-full px-4 py-1.5 transition-colors ${mode === "book" ? "bg-card text-fg font-medium shadow-sm" : "text-muted hover:text-fg"}`}>📚 本を探す</button>
        </div>
      </div>
      {mode === "answer" ? <AnswerSearch /> : <SearchBox />}
      <p className="mt-3 text-center text-xs text-muted">
        {mode === "answer" ? "悩みを入れると、複数の本から共通する答えを先に出します。" : "タイトル・著者・ISBNで本を検索。未掲載でもその場で調査します。"}
      </p>
    </div>
  );
}
