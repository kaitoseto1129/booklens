"use client";
import { useEffect, useState } from "react";
import SlidePlayer, { type Slide } from "./SlidePlayer";
import { multiBookSlides } from "@/lib/slides";
import type { Analysis } from "@/lib/ai/schemas";

type BookStatus = { book: { title: string; authors: string[] }; analysis: { status: string; content: Analysis | null } | null };

/** 開いているタブ（複数の本）を横断して、要点だけを続けて解説する。 */
export default function MultiExplainer({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [msg, setMsg] = useState("本をまとめています…");

  useEffect(() => {
    (async () => {
      const results = await Promise.all(
        ids.map((id) => fetch(`/api/books/${id}/status`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<BookStatus>) : null)).catch(() => null)),
      );
      const books = results
        .filter((r): r is BookStatus => Boolean(r?.analysis?.content))
        .map((r) => ({ title: r.book.title, authors: r.book.authors.join(", "), a: r.analysis!.content! }));
      if (books.length === 0) { setMsg("解説できる本がありません（要約が完了した本を開いてください）。"); return; }
      setSlides(multiBookSlides(books));
    })();
  }, [ids]);

  if (!slides) {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted pulse">{msg}</p>
        <button onClick={onClose} className="text-sm underline text-muted">閉じる</button>
      </div>
    );
  }
  return <SlidePlayer slides={slides} onClose={onClose} />;
}
