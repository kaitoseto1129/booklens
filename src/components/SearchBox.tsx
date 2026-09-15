"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Candidate } from "@/lib/books/types";
import { normJa } from "@/lib/books/ndl";

const LANG: Record<string, string> = { eng: "英語", jpn: "日本語", fre: "フランス語", ger: "ドイツ語", spa: "スペイン語", chi: "中国語", kor: "韓国語", ita: "イタリア語" };
const SRC: Record<string, string> = { openlibrary: "Open Library", ndl: "国会図書館", googlebooks: "Google Books", ai: "AI検索" };

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [searched, setSearched] = useState("");
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState<number | null>(null);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const clientCache = useRef<Map<string, Candidate[]>>(new Map());

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    const term = q.trim();
    const cached = clientCache.current.get(term);
    if (cached) { setItems(cached); setSearched(term); setOpen(true); return; }
    timer.current = setTimeout(() => {
      const my = ++seq.current;
      const ja = /[\u3040-\u30ff\u4e00-\u9fff]/.test(term);
      setLoading(true);
      let pending = 2;
      let ol: Candidate[] = [];
      let ndl: Candidate[] = [];
      const merge = () => {
        // 日本語クエリは NDL 優先、英語は OL 優先。ISBN/題名+著者で重複除去。
        const ordered = ja ? [...ndl, ...ol] : [...ol, ...ndl];
        const seen = new Set<string>();
        const out: Candidate[] = [];
        for (const c of ordered) {
          const k = c.isbn13 ?? `${normJa(c.title)}|${normJa(c.authors[0] ?? "")}`;
          if (seen.has(k)) continue;
          seen.add(k); out.push(c);
          if (out.length >= 8) break;
        }
        if (my === seq.current) { setItems(out); setSearched(term); setOpen(true); if (out.length) clientCache.current.set(term, out); }
      };
      const fetchSrc = async (src: "ol" | "ndl") => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&src=${src}`);
          const data = (await res.json()) as { candidates: Candidate[] };
          if (my !== seq.current) return;
          if (src === "ol") ol = data.candidates; else ndl = data.candidates;
          merge();
        } finally {
          if (my === seq.current && --pending === 0) setLoading(false);
        }
      };
      // 日本語なら NDL を先に投げる（体感速度）
      if (ja) { fetchSrc("ndl"); fetchSrc("ol"); } else { fetchSrc("ol"); fetchSrc("ndl"); }
    }, 160);
  }, [q]);

  async function searchAI() {
    if (aiLoading || q.trim().length < 2) return;
    setAiLoading(true); setAiError(null);
    try {
      const res = await fetch(`/api/search/ai?q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json()) as { candidates?: Candidate[]; error?: string };
      if (data.error) setAiError(data.error);
      else {
        // 通常検索の結果の後ろに、重複しないものを足す
        const have = new Set(items.map((c) => c.isbn13 ?? c.title));
        setItems([...items, ...(data.candidates ?? []).filter((c) => !have.has(c.isbn13 ?? c.title))]);
        setOpen(true);
      }
    } finally {
      setAiLoading(false);
    }
  }

  async function choose(c: Candidate, i: number) {
    setChoosing(i);
    const res = await fetch("/api/books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    const data = (await res.json()) as { id: string };
    router.push(`/books/${data.id}`);
  }

  const showEmpty = open && !loading && searched === q.trim() && q.trim().length >= 2 && items.length === 0;

  return (
    <div className="relative max-w-xl mx-auto text-left">
      <form onSubmit={(e) => { e.preventDefault(); searchAI(); }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) { setItems([]); setOpen(false); } }}
          onFocus={() => items.length && setOpen(true)}
          placeholder="タイトル・著者・ISBN（例: Thinking in Bets / 嫌われる勇気）"
          className="w-full rounded-full border border-line bg-card px-5 py-3.5 text-base shadow-sm outline-none focus:border-accent"
          autoFocus
        />
      </form>
      {loading && <div className="absolute right-4 top-4 text-xs text-muted pulse">検索中…</div>}

      {(open && (items.length > 0 || showEmpty)) && (
        <div className="absolute z-20 mt-2 w-full card shadow-lg overflow-hidden">
          {items.length > 0 && (
            <ul>
              {items.map((c, i) => (
                <li key={`${c.isbn13 ?? c.olWorkKey ?? c.title}-${i}`}>
                  <button disabled={choosing !== null} onClick={() => choose(c, i)} className="w-full text-left px-4 py-3 flex gap-3 hover:bg-accent-soft disabled:opacity-60">
                    {c.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverUrl.replace("-L.jpg", "-S.jpg")} alt="" className="w-8 h-12 object-cover rounded bg-line" />
                    ) : (
                      <div className="w-8 h-12 rounded bg-line shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-snug">
                        {c.title}{c.subtitle ? <span className="text-muted font-normal">：{c.subtitle}</span> : null}
                        {c.cached && <span className="ml-2 text-[10px] rounded px-1.5 py-0.5 bg-accent-soft text-accent align-middle">要約済み・即表示</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {c.authors.join(", ") || "著者不明"}
                        {c.year ? ` · ${c.year}` : ""}
                        {c.publisher ? ` · ${c.publisher}` : ""}
                        {c.language ? ` · ${LANG[c.language] ?? c.language}` : ""}
                        {c.isbn13 ? ` · ISBN ${c.isbn13}` : ""}
                        {c.editionCount > 1 ? ` · ${c.editionCount}版` : ""}
                        <span className="ml-1 opacity-70">[{SRC[c.source] ?? c.source}]</span>
                      </div>
                      {c.note && <div className="text-xs text-muted">{c.note}</div>}
                    </div>
                    {choosing === i && <span className="text-xs text-muted self-center pulse">開いています…</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-4 py-2.5 text-xs text-muted flex items-center justify-between gap-3">
            <span>{showEmpty ? "見つかりませんでした。" : "探している本がない？"}</span>
            <button type="button" onClick={searchAI} disabled={aiLoading} className="rounded-full border border-line px-3 py-1 hover:border-accent disabled:opacity-60">
              {aiLoading ? <span className="pulse">AIがWebで探しています（10〜20秒）…</span> : "AIでWeb検索して探す"}
            </button>
          </div>
          {aiError && <div className="px-4 pb-2 text-xs text-accent">{aiError}</div>}
        </div>
      )}
    </div>
  );
}
