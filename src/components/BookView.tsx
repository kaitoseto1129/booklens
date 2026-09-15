"use client";
import { useCallback, useEffect, useState } from "react";
import type { Analysis, Quick, QA } from "@/lib/ai/schemas";
import type { Confidence } from "@/lib/ai/confidence";
import type { SourceRow } from "@/lib/db";
import Mermaid from "./Mermaid";
import ProgressPanel, { type Eta } from "./ProgressPanel";
import Visuals from "./Visuals";
import { upsertTab } from "@/lib/tabs";
import SlidePlayer from "./SlidePlayer";
import VideoPlayer from "./VideoPlayer";
import type { VideoSceneT, VisualBlockT } from "@/lib/ai/schemas";
import { singleBookSlides, timeEstimate } from "@/lib/slides";
import Chat from "./Chat";
import PersonaBox from "./PersonaBox";
import Quiz from "./Quiz";
import { loadU, setU, statsU, type Level } from "@/lib/understanding";
import { loadContext, hasContext, type MyContext } from "@/lib/context";

const emit = (name: string, detail?: string) => window.dispatchEvent(new CustomEvent(name, { detail }));

type Status = {
  book: {
    id: string; title: string; subtitle: string | null; original_title: string | null; authors: string[]; publisher: string | null;
    published_year: number | null; language: string | null; cover_url: string | null; isbn13: string | null; source_type: "A" | "B" | null; pages: number | null; author_image: string | null; topic_image: string | null;
  };
  analysis: {
    id: number; version: number; status: "pending" | "running" | "done" | "error"; step: string | null; step_label: string | null; progress: number;
    quick: Quick | null; content: Analysis | null; visuals: VisualBlockT[] | null; confidence: Confidence | null; qa: QA | null; error: string | null;
    usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null; updated_at: string;
    timeline: { step: string; label: string; started_at: number; ended_at: number | null }[] | null; started_at: string | null;
  } | null;
  sources: SourceRow[];
  eta: Eta | null;
  estimate_total_seconds: number;
};

const LIB_LABEL: Record<string, string> = { want: "読みたい", reading: "読んでいる", done: "読了", summary_only: "要約だけ読んだ" };
const TIER_LABEL: Record<number, string> = { 1: "一次情報", 2: "公式寄り", 3: "書評・解説", 4: "一般" };
const TYPE_LABEL: Record<string, string> = { publisher: "出版社", author: "著者", toc: "目次", preview: "公開プレビュー", review: "書評", interview: "インタビュー", library: "図書館", wiki: "百科事典", fulltext: "本文", other: "その他" };

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Stars({ n }: { n: number }) {
  const v = Math.max(1, Math.min(5, Math.round(n)));
  const label = ["", "読み飛ばし可", "具体例", "補足", "重要", "必須"][v];
  return <span className="text-[11px] text-muted" title={label}>{"★".repeat(v)}{"☆".repeat(5 - v)}</span>;
}
const Tag = ({ kind }: { kind: "book" | "insight" }) => (
  <span className={`text-[10px] font-semibold tracking-wider rounded px-1.5 py-0.5 ${kind === "book" ? "tag-book" : "tag-insight"}`}>{kind === "book" ? "BOOK" : "AI INSIGHT"}</span>
);
const Refs = ({ refs }: { refs?: string[] }) => (refs && refs.length ? <span className="text-[11px] text-muted ml-1">({refs.join(", ")})</span> : null);

/** アコーディオンの1行（クリックした人だけ本文を見る） */
function Acc({ title, children, defaultOpen = false }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-0">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 py-3.5 text-left">
        <span className="font-medium">{title}</span>
        <span className="text-muted text-lg shrink-0 leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="pb-4 text-sm space-y-3 -mt-0.5">{children}</div>}
    </div>
  );
}

const TOC = [
  { id: "conc", label: "結論" },
  { id: "use", label: "どう使うか" },
  { id: "takeaways", label: "得られる3つ" },
  { id: "points", label: "重要ポイント" },
  { id: "structure", label: "本の構造" },
  { id: "apply", label: "自分に活かす" },
  { id: "ask", label: "AIに質問" },
  { id: "more", label: "もっと詳しく" },
];

export default function BookView({ id, initialLibraryStatus }: { id: string; initialLibraryStatus: string | null }) {
  const [st, setSt] = useState<Status | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [openPoint, setOpenPoint] = useState<number | null>(0);
  const [structTab, setStructTab] = useState<"diagram" | "visual">("diagram");
  const [diagIdx, setDiagIdx] = useState(0);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [lib, setLib] = useState<string | null>(initialLibraryStatus);
  const [playing, setPlaying] = useState(false);
  const [video, setVideo] = useState<{ scenes: VideoSceneT[]; length: number } | null>(null);
  const [videoLoading, setVideoLoading] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [u, setUState] = useState<Record<string, Level>>({});
  useEffect(() => {
    const refresh = () => setUState(loadU(id));
    const raf = requestAnimationFrame(refresh);
    window.addEventListener("booklens-understanding", refresh);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("booklens-understanding", refresh); };
  }, [id]);
  const markU = (i: number, lvl: Level) => setU(id, i, u[String(i)] === lvl ? null : lvl);
  const [ctx, setCtx] = useState<MyContext | null>(null);
  useEffect(() => {
    const refresh = () => setCtx(loadContext());
    const raf = requestAnimationFrame(refresh);
    window.addEventListener("booklens-context-saved", refresh);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("booklens-context-saved", refresh); };
  }, []);
  const [askVisible, setAskVisible] = useState(false);
  const hasCtx = ctx ? hasContext(ctx) : false;
  const ctxLines = ctx ? [ctx.challenge, ctx.initiatives, ctx.marketing, ctx.kpi].filter((v): v is string => Boolean(v && v.trim())) : [];
  useEffect(() => {
    const el = document.getElementById("ask");
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setAskVisible(e.isIntersecting), { rootMargin: "0px 0px -35% 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [st]);

  async function openVideo(len: 5 | 10 | 20, mode: "auto" | "derived" = "auto") {
    setVideoLoading(len);
    try {
      const r = await fetch(`/api/books/${id}/video?length=${len}&mode=${mode}`);
      const d = (await r.json()) as { scenes?: VideoSceneT[]; length?: number };
      if (d.scenes) setVideo({ scenes: d.scenes, length: d.length ?? len });
    } finally { setVideoLoading(null); }
  }
  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) { await navigator.share({ title: st?.book.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* キャンセル等 */ }
  }

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { upsertTab({ id, title: "", cover: null }); }, [id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const r = await fetch(`/api/books/${id}/status`, { cache: "no-store" });
      if (!r.ok || cancelled) return;
      const data = (await r.json()) as Status;
      if (cancelled) return;
      if (!data.analysis) { await fetch(`/api/books/${id}/generate`, { method: "POST" }); timer = setTimeout(poll, 800); return; }
      setSt(data);
      setReceivedAt(Date.now());
      upsertTab({ id, title: data.book.title, cover: data.book.cover_url });
      if (data.analysis.status === "running" || data.analysis.status === "pending") timer = setTimeout(poll, 2500);
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, tick]);

  async function saveLib(status: string | null) {
    const r = await fetch(`/api/books/${id}/library`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setLib(((await r.json()) as { status: string | null }).status);
  }
  async function regenerate() {
    if (!confirm("最新の情報源で要約を再生成しますか？（数分かかります）")) return;
    await fetch(`/api/books/${id}/generate?force=1`, { method: "POST" });
    load();
  }

  if (!st) return <div className="mx-auto max-w-3xl px-4 py-16 text-muted pulse">読み込み中…</div>;
  const { book, analysis } = st;
  const a = analysis?.content ?? null;
  const conf = analysis?.confidence ?? null;
  const done = analysis?.status === "done" && !!a;
  const hasStruct = Boolean((a && a.diagrams.length) || (analysis?.visuals && analysis.visuals.length));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* ヘッダー（表紙ヒーロー） */}
      <header className="relative flex gap-4 sm:gap-5 rounded-2xl overflow-hidden p-4 sm:p-5 -mx-1">
        {book.cover_url && (
          <div className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={book.cover_url} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-30" aria-hidden />
            <div className="absolute inset-0 bg-bg/60" />
          </div>
        )}
        {book.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover_url} alt="" className="w-24 h-36 object-cover rounded-lg shadow-md shrink-0" />
        ) : <div className="w-24 h-36 rounded-lg bg-line shrink-0" />}
        <div className="min-w-0 flex-1">
          <h1 className="display text-2xl sm:text-3xl leading-tight">{book.title}</h1>
          {book.subtitle && <p className="text-muted">{book.subtitle}</p>}
          <p className="mt-1 text-sm flex items-center gap-2">
            {book.author_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.author_image} alt="" className="w-6 h-6 rounded-full object-cover" />
            )}
            <span>{book.authors.join(", ")}{book.published_year ? ` · ${book.published_year}` : ""}{book.publisher ? ` · ${book.publisher}` : ""}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {conf ? (
              <button onClick={() => setShowSources(true)} className="text-xs rounded-full border border-line px-3 py-1 hover:border-accent" title={conf.basis}>情報精度：<b>{conf.level_label}</b> <span className="text-muted">{conf.overall}%</span></button>
            ) : <span className="text-xs rounded-full border border-line px-3 py-1 text-muted">情報精度：確認中</span>}
            {done && <button onClick={() => setShowSources(true)} className="text-xs rounded-full border border-line px-3 py-1 hover:border-accent">情報源 {st.sources.length}</button>}
            <select value={lib ?? ""} onChange={(e) => saveLib(e.target.value || null)} className="text-xs rounded-full border border-line bg-card px-3 py-1">
              <option value="">ライブラリに保存…</option>
              {Object.entries(LIB_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {lib && <span className="text-xs text-accent">保存済み（{LIB_LABEL[lib]}）</span>}
          </div>
        </div>
      </header>

      {/* 進捗 / 速報 */}
      {analysis && analysis.status !== "done" && (
        analysis.status === "error" ? (
          <div className="card p-4 mt-4"><p className="text-sm text-accent">生成に失敗しました：{analysis.error}</p><button onClick={regenerate} className="mt-2 text-sm underline">もう一度試す</button></div>
        ) : <div className="mt-4"><ProgressPanel eta={st.eta} stepLabel={analysis.step_label} progress={analysis.progress} receivedAt={receivedAt} quickShown={Boolean(analysis.quick)} /></div>
      )}
      {!done && analysis?.quick && (
        <section className="card p-5 border-dashed mt-4">
          <div className="flex items-center gap-2 mb-2"><span className="text-xs rounded px-1.5 py-0.5 bg-accent-soft text-accent">速報版・確認中</span><span className="text-xs text-muted">{analysis.quick.note}</span></div>
          <p className="text-lg font-medium">{analysis.quick.one_liner}</p>
          <ol className="mt-3 space-y-2 list-decimal pl-5">{analysis.quick.top3.map((p, i) => <li key={i}><b>{p.title}</b> — {p.body}</li>)}</ol>
        </section>
      )}

      {done && a && (
        <>
          {/* 結論ヒーロー（Level 1） */}
          {(() => { const te = timeEstimate(a, book.pages); return (
            <section id="conc" className="mt-6 card p-6 sm:p-8 border-accent/40 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-accent" />
              <div className="text-xs tracking-widest uppercase text-accent mb-3">この本を一言でいうと？</div>
              <p className="display text-xl sm:text-2xl md:text-[1.9rem] leading-snug">{a.most_important.message}</p>
              <p className="mt-4 text-sm text-muted max-w-2xl">{a.most_important.explanation}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => openVideo(10)} disabled={videoLoading !== null} className="rounded-full bg-accent text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50">▶ 動画で見る</button>
                <button onClick={() => scrollToId("takeaways")} className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent">📖 3分で読む</button>
                <button onClick={() => scrollToId("ask")} className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent">✨ AIに質問</button>
                <span className="text-xs rounded-full bg-book-soft text-book px-3 py-2.5 self-center">原著 約{te.origHours}時間 → {te.summaryMin}分</span>
              </div>
            </section>
          ); })()}

          {/* この本をどう使いますか？（BookLensの核・前面に配置） */}
          <section id="use" className="mt-5 card p-5 sm:p-6 border-accent/30 bg-accent-soft/20">
            <div className="text-xs tracking-widest uppercase text-accent mb-1">BookLens</div>
            <h2 className="font-display text-xl mb-1">この本をどう使いますか？</h2>
            <p className="text-sm text-muted mb-4">読むだけで終わらせない。あなた自身・あなたの事業に当てはめて、次の行動まで変えます。</p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              <button onClick={() => scrollToId("takeaways")} className="rounded-xl border border-line bg-card hover:border-accent p-4 text-left card-hover">
                <div className="text-2xl mb-1">📖</div><div className="font-medium">本を理解する</div><div className="text-xs text-muted mt-0.5">要約・図解・動画で学ぶ</div>
              </button>
              <button onClick={() => { emit("booklens-mode", "apply"); scrollToId("ask"); }} className="rounded-xl border border-accent/50 bg-card hover:border-accent p-4 text-left card-hover">
                <div className="text-2xl mb-1">✨</div><div className="font-medium">自分に活かす</div><div className="text-xs text-muted mt-0.5">自分の状況に当てはめる</div>
              </button>
              <button onClick={() => { emit("booklens-mode", "apply"); scrollToId("ask"); }} className="rounded-xl border border-accent/50 bg-card hover:border-accent p-4 text-left card-hover">
                <div className="text-2xl mb-1">🏢</div><div className="font-medium">自社・事業に活かす</div><div className="text-xs text-muted mt-0.5">事業の意思決定に使う</div>
              </button>
            </div>
            {hasCtx ? (
              <div className="mt-4 rounded-xl border border-line bg-card p-4">
                <div className="text-xs text-muted mb-1.5">この本を当てはめる先</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">🏢 {ctx?.name || "あなたの事業"}</span>
                  <button onClick={() => emit("booklens-context-edit")} className="text-xs text-accent hover:underline">編集</button>
                </div>
                {ctxLines.length > 0 && <ul className="mt-2 text-xs text-muted space-y-0.5">{ctxLines.slice(0, 3).map((l, i) => <li key={i}>・{l}</li>)}</ul>}
                <button onClick={() => { emit("booklens-apply", `「${book.title}」の考え方を${ctx?.name || "私の事業"}に当てはめて、いま最優先でやるべき改善策を具体的に出して。`); scrollToId("ask"); }}
                  className="mt-3 rounded-full bg-accent text-white px-5 py-2 text-sm font-medium hover:opacity-90">この本から改善策を出す →</button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-accent/40 bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm text-muted">自分・自社の情報を登録すると、この本をあなたの状況に当てはめて答えます。</span>
                <button onClick={() => emit("booklens-context-edit")} className="shrink-0 rounded-full border border-accent text-accent px-4 py-2 text-sm hover:bg-accent-soft">事業・自分の情報を設定</button>
              </div>
            )}
          </section>

          <div className="mt-8 grid lg:grid-cols-[minmax(0,1fr)_240px] gap-8 items-start">
            <main className="space-y-10 min-w-0">
              {/* この本から得られる3つ + 動画（コンパクト） */}
              <section id="takeaways">
                <h2 className="font-display text-xl mb-3">この本から得られる3つ</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  {a.brief30.top3.map((p, i) => (
                    <div key={i} className="card p-4 card-hover"><div className="font-display text-2xl text-accent">{String(i + 1).padStart(2, "0")}</div><div className="font-medium mt-1">{p.title}</div><p className="text-sm text-muted mt-1 line-clamp-3">{p.body}</p></div>
                  ))}
                </div>
                <p className="mt-3 text-sm"><Tag kind="book" /> <span className="ml-1">{a.brief30.one_liner}</span></p>
                <p className="text-xs text-muted mt-1">誰におすすめ：{a.brief30.for_whom}</p>
                <div className="mt-4 rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">🎬 動画で理解する</span>
                    <div className="flex gap-1.5">
                      {([5, 10, 20] as const).map((len) => (
                        <button key={len} onClick={() => openVideo(len)} disabled={videoLoading !== null} className="rounded-full border border-line hover:border-accent px-3 py-1.5 text-xs disabled:opacity-50">{len}分{videoLoading === len ? "…" : ""}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <button onClick={() => setPlaying(true)} className="text-accent hover:underline">▶ 音声だけで聞く</button>
                    <button onClick={() => openVideo(10, "derived")} disabled={videoLoading !== null} className="text-muted hover:text-fg underline">かんたん版（即時）</button>
                    <button onClick={share} className="text-muted hover:text-fg underline">{copied ? "コピーしました ✓" : "🔗 共有"}</button>
                  </div>
                  {videoLoading !== null && <div className="text-[11px] text-accent pulse mt-1">AIが作成中…初回のみ約1分</div>}
                </div>
              </section>

              {/* 重要ポイント（上位だけ展開、残りは隠す・各カードは短く） */}
              <section id="points">
                <h2 className="font-display text-xl mb-3">重要なポイント</h2>
                <ol className="space-y-2.5">
                  {a.key_points.map((p, i) => {
                    if (i >= 5 && !showAllPoints) return null;
                    const open = openPoint === i;
                    const lv1 = p.importance >= 5;
                    return (
                      <li key={i} className={`rounded-2xl border ${lv1 ? "border-accent/40 bg-accent-soft/30" : "border-line bg-card"} card-hover`}>
                        <button onClick={() => setOpenPoint(open ? -1 : i)} className="w-full text-left p-4 flex gap-3 items-start">
                          <span className="font-display text-xl text-accent shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">{p.title}</span>
                            <span className="ml-2 inline-block"><Stars n={p.importance} /></span>
                            {lv1 && <span className="ml-2 text-[10px] font-semibold text-accent tracking-wider">必須</span>}
                            {!open && <span className="block text-sm text-muted mt-0.5 line-clamp-2">{p.body}</span>}
                          </span>
                          <span className="text-muted text-xs shrink-0 mt-1">{open ? "− 閉じる" : "詳しく"}</span>
                        </button>
                        {open && (
                          <div className="px-4 pb-4 text-sm -mt-1">
                            <Tag kind="book" /> <span className="ml-1">{p.body}</span><Refs refs={p.evidence} />
                            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                              {([["got", "✓ 理解した"], ["review", "☆ 復習"], ["unclear", "？ わからない"]] as [Level, string][]).map(([lv, label]) => (
                                <button key={lv} onClick={() => { markU(i, lv); if (lv === "unclear") { emit("booklens-explain", `「${p.title}」を、中学生でも分かるように、具体例つきでやさしく説明して。`); scrollToId("ask"); } }}
                                  className={`text-xs rounded-full px-2.5 py-1 border ${u[String(i)] === lv ? (lv === "got" ? "bg-good text-white border-transparent" : lv === "review" ? "bg-accent text-white border-transparent" : "bg-book text-white border-transparent") : "border-line text-muted hover:border-accent"}`}>{label}</button>
                              ))}
                              <span className="w-px h-4 bg-line mx-1" />
                              <button onClick={() => { emit("booklens-apply", `この考え方「${p.title}」を、自分の事業に当てはめると具体的に何をすべき？`); scrollToId("ask"); }} className="text-xs rounded-full border border-accent text-accent px-3 py-1 hover:bg-accent-soft">自分に当てはめる ✨</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {a.key_points.length > 5 && (
                  <button onClick={() => setShowAllPoints((v) => !v)} className="mt-3 text-sm text-accent hover:underline">{showAllPoints ? "上位だけ表示 ↑" : `残り${a.key_points.length - 5}個のポイントを見る →`}</button>
                )}
              </section>

              {/* 本の構造（図解） */}
              {hasStruct && (
                <section id="structure">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="font-display text-xl">本の構造</h2>
                    <div className="flex gap-1 text-xs">
                      {a.diagrams.length > 0 && <button onClick={() => setStructTab("diagram")} className={`rounded-full px-3 py-1 ${structTab === "diagram" ? "bg-fg text-bg" : "border border-line text-muted"}`}>図で理解</button>}
                      {analysis?.visuals && analysis.visuals.length > 0 && <button onClick={() => setStructTab("visual")} className={`rounded-full px-3 py-1 ${structTab === "visual" ? "bg-fg text-bg" : "border border-line text-muted"}`}>表で理解</button>}
                    </div>
                  </div>
                  {structTab === "diagram" && a.diagrams.length > 0 && (
                    a.diagrams.length === 1 ? (
                      <Mermaid code={a.diagrams[0].mermaid} title={a.diagrams[0].title} caption={a.diagrams[0].caption} />
                    ) : (
                      <div>
                        <div className="flex gap-1.5 flex-wrap mb-3">
                          {a.diagrams.map((d, i) => (
                            <button key={i} onClick={() => setDiagIdx(i)} className={`text-xs rounded-full px-3 py-1.5 ${diagIdx === i ? "bg-accent text-white" : "border border-line text-muted hover:border-accent"}`}>{d.title}</button>
                          ))}
                        </div>
                        {(() => { const d = a.diagrams[Math.min(diagIdx, a.diagrams.length - 1)]; return <Mermaid key={diagIdx} code={d.mermaid} title={d.title} caption={d.caption} />; })()}
                      </div>
                    )
                  )}
                  {structTab === "visual" && analysis?.visuals && analysis.visuals.length > 0 && <Visuals visuals={analysis.visuals} />}
                </section>
              )}

              {/* ✨ 自分/自社に活かす（BookLensの核・大きく）＋ 実践STEP */}
              <section id="apply" className="card p-6 border-accent/40 bg-accent-soft/20 space-y-5">
                <div>
                  <div className="text-xs tracking-widest uppercase text-accent mb-1">BookLens の使いどころ</div>
                  <h2 className="font-display text-xl sm:text-2xl">✨ この本をあなたに当てはめる</h2>
                  <p className="text-sm text-muted mt-1">あなたの状況と、この本の知識を組み合わせて、次にやるべきことを提案します。</p>
                  <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
                    <button onClick={() => { emit("booklens-apply", `「${book.title}」の考え方を、私自身の状況に当てはめて、次にやるべきことを提案して。`); scrollToId("ask"); }} className="rounded-xl bg-card border border-accent/50 hover:border-accent p-4 text-left card-hover"><div className="text-2xl mb-1">✨</div><div className="font-medium">自分に活かす</div><div className="text-xs text-muted mt-0.5">自分の状況に当てはめる</div></button>
                    <button onClick={() => { emit("booklens-apply", `「${book.title}」の考え方を${ctx?.name || "私の事業"}に当てはめて、いま最優先でやるべき改善策を出して。`); scrollToId("ask"); }} className="rounded-xl bg-card border border-accent/50 hover:border-accent p-4 text-left card-hover"><div className="text-2xl mb-1">🏢</div><div className="font-medium">自社・事業に活かす</div><div className="text-xs text-muted mt-0.5">{hasCtx ? `${ctx?.name || "あなたの事業"} に当てはめる` : "事業の意思決定に使う"}</div></button>
                  </div>
                </div>
                <div id="practice" className="pt-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                    <h3 className="font-medium">この本を実践するなら</h3>
                    <button onClick={() => { emit("booklens-apply", `「${book.title}」を${ctx?.name ? ctx.name + "で" : "私の状況で"}実践するための、具体的なSTEP（各STEPでやることと、その理由）を作って。`); scrollToId("ask"); }} className="text-xs rounded-full bg-accent text-white px-4 py-1.5 font-medium hover:opacity-90">✨ 私の場合のSTEPを作る</button>
                  </div>
                  <ol className="space-y-2">
                    {a.action_items.map((t, i) => (
                      <li key={i} className="flex gap-3 items-start rounded-xl bg-card border border-line p-3">
                        <span className="shrink-0 rounded-lg bg-accent-soft text-accent font-display text-xs px-2 py-1">STEP {i + 1}</span>
                        <span className="text-sm flex-1">{t}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>

              {/* BookLens AI */}
              <section id="ask"><Chat bookId={id} ready={done} bookTitle={book.title} /></section>

              {/* もっと詳しく読む（すべてアコーディオン・開いた人だけ表示） */}
              <section id="more">
                <h2 className="font-display text-xl mb-1">もっと詳しく読む</h2>
                <p className="text-xs text-muted mb-3">必要な人だけ。項目を開くと本文が表示されます。</p>
                <div className="card px-5">
                  <Acc title={`重要な概念・用語（${a.brief180.concepts.length}）`}>
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      {a.brief180.concepts.map((c, i) => (
                        <div key={i} className="rounded-xl border border-line p-3"><div className="flex justify-between gap-2 items-baseline"><b>{c.name}</b><Stars n={c.importance} /></div><p className="text-sm text-muted mt-1">{c.description}<Refs refs={c.evidence} /></p><button onClick={() => { emit("booklens-explain", `「${c.name}」を、中学生でも分かるように、具体例つきでやさしく説明して。`); scrollToId("ask"); }} className="mt-2 text-xs text-accent hover:underline">やさしく説明 →</button></div>
                      ))}
                    </div>
                  </Acc>
                  <Acc title={<>章ごとの詳細 {a.detail.chapters_verified && <span className="text-xs text-muted font-normal">（目次を確認済み）</span>}</>}>
                    {a.detail.chapters.length > 0
                      ? <ol className="space-y-2">{a.detail.chapters.map((c) => <li key={c.number} className="border-l-2 border-line pl-3"><b>第{c.number}章 {c.title}</b><p className="text-muted mt-0.5">{c.summary}</p></li>)}</ol>
                      : <p className="text-muted">{a.detail.chapters_note || "章ごとの詳細は十分取得できませんでした。"}</p>}
                  </Acc>
                  <Acc title="著者の主張を詳しく">
                    <div><h4 className="font-semibold mb-1">この本の問題意識</h4><p>{a.brief180.problem}</p></div>
                    <div><h4 className="font-semibold mb-1">中心的な問い</h4><p>{a.detail.central_question}</p></div>
                    <div><h4 className="font-semibold mb-1">著者の結論</h4><p>{a.brief180.conclusion}</p></div>
                    <div><h4 className="font-semibold mb-1">主張</h4><ul className="list-disc pl-5 space-y-1">{a.detail.claims.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                    {a.detail.examples.length > 0 && <div><h4 className="font-semibold mb-1">具体例</h4><ul className="list-disc pl-5 space-y-1">{a.detail.examples.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
                    {a.detail.critiques.length > 0 && <div><h4 className="font-semibold mb-1"><Tag kind="book" /> 批判・限界</h4><ul className="list-disc pl-5 space-y-1">{a.detail.critiques.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
                    <div><h4 className="font-semibold mb-1">応用方法</h4><ul className="list-disc pl-5 space-y-1">{a.detail.applications.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                  </Acc>
                  <Acc title="本の背景・著者について">
                    <div><h4 className="font-semibold mb-1">本の背景</h4><p>{a.detail.background}</p></div>
                    <div className="flex gap-4">
                      {book.author_image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={book.author_image} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0 border border-line" />
                      )}
                      <div><h4 className="font-semibold mb-1">著者について</h4><p>{a.detail.about_author}</p></div>
                    </div>
                  </Acc>
                  <Acc title={<><Tag kind="insight" /> <span className="ml-1">応用・反論（AIによる視点）</span></>}>
                    {a.ai_insight.applications.length > 0 && <div><h4 className="font-medium mb-1">応用の視点</h4><ul className="list-disc pl-5 space-y-1">{a.ai_insight.applications.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                    {a.ai_insight.counterarguments.length > 0 && <div><h4 className="font-medium mb-1">反論・弱点</h4><ul className="list-disc pl-5 space-y-1">{a.ai_insight.counterarguments.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                    {a.ai_insight.evidence_check && <div><h4 className="font-medium mb-1">Evidence Check</h4><p>{a.ai_insight.evidence_check}</p></div>}
                  </Acc>
                  <Acc title="今日から使える1つ・なぜ重要か">
                    <div><h4 className="font-semibold mb-1">今日から使える1つ</h4><p className="font-medium">{a.today_action.action}</p><p className="text-muted mt-1">{a.today_action.why}</p></div>
                    <div><h4 className="font-semibold mb-1">なぜこの本が重要か</h4><p>{a.why_care}</p></div>
                  </Acc>
                  <Acc title="立場を変えて読む（ペルソナ別）"><PersonaBox bookId={id} /></Acc>
                  <Acc title="理解度をクイズで確認"><Quiz bookId={id} /></Acc>
                  {a.quotes.length > 0 && (
                    <Acc title="印象的な引用">
                      <ul className="space-y-2">{a.quotes.map((q, i) => <li key={i} className="border-l-2 border-accent pl-3 italic">“{q.text}” <span className="not-italic text-xs text-muted">({q.evidence})</span></li>)}</ul>
                    </Acc>
                  )}
                  {(a.unverified.length > 0 || a.conflicts.length > 0) && (
                    <Acc title="確認できていない点・資料の食い違い">
                      <div className="text-muted space-y-2">
                        {a.unverified.length > 0 && <div><b>確認できていない点：</b><ul className="list-disc pl-5">{a.unverified.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                        {a.conflicts.length > 0 && <div><b>資料によって説明が異なる点：</b><ul className="list-disc pl-5">{a.conflicts.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                      </div>
                    </Acc>
                  )}
                </div>
              </section>

              <div className="flex flex-wrap gap-4 text-xs text-muted pt-2">
                <button onClick={() => setShowReport(true)} className="underline">内容が違う</button>
                <button onClick={regenerate} className="underline">最新情報で再生成</button>
                <span>v{analysis?.version} · {book.source_type === "A" ? "本文ベース" : "公開情報ベース"}</span>
              </div>
            </main>

            {/* 固定サイドバー（PC） */}
            <aside className="hidden lg:block sticky top-20 space-y-3">
              <nav className="card p-4">
                <div className="text-[11px] text-muted mb-2 tracking-widest uppercase">目次</div>
                <div className="space-y-0.5">
                  {TOC.map((t) => ((t.id === "structure" && !hasStruct) ? null : (
                    <button key={t.id} onClick={() => scrollToId(t.id)} className="block w-full text-left py-1 text-sm text-muted hover:text-accent transition-colors">{t.label}</button>
                  )))}
                </div>
              </nav>
              {(() => {
                const stat = statsU(u, a.key_points.length);
                return (
                  <div className="card p-4">
                    <div className="text-[11px] text-muted tracking-widest uppercase mb-2">自分の理解度</div>
                    <div className="flex items-baseline gap-2"><span className="font-display text-2xl text-accent">{stat.pct}%</span><span className="text-xs text-muted">理解済み</span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-good" style={{ width: `${stat.pct}%` }} /></div>
                    {(stat.review.length > 0 || stat.unclear.length > 0) && (
                      <div className="mt-3 text-xs space-y-1">
                        {stat.unclear.map((i) => <button key={`u${i}`} onClick={() => scrollToId("points")} className="block text-left text-book hover:underline">？ {a.key_points[i]?.title}</button>)}
                        {stat.review.map((i) => <button key={`r${i}`} onClick={() => scrollToId("points")} className="block text-left text-accent hover:underline">☆ {a.key_points[i]?.title}</button>)}
                      </div>
                    )}
                    {stat.pct === 0 && stat.review.length === 0 && stat.unclear.length === 0 && <p className="text-xs text-muted mt-2">重要ポイントを「理解した／復習／わからない」で記録できます。</p>}
                  </div>
                );
              })()}
              <button onClick={() => scrollToId("ask")} className="card card-hover w-full text-left p-4">
                <div className="text-sm font-medium">✨ この本について質問</div>
                <div className="text-xs text-muted mt-0.5">分からない所をAIに聞く</div>
              </button>
            </aside>
          </div>
        </>
      )}

      {/* フローティングAIボタン（チャットが画面内のときは隠す） */}
      {done && !askVisible && (
        <button onClick={() => scrollToId("ask")} className="fixed bottom-5 right-5 z-40 rounded-full bg-accent text-white shadow-lg px-4 py-3 text-sm font-medium hover:opacity-90">✨ 質問</button>
      )}

      {playing && a && <SlidePlayer slides={singleBookSlides(a, book.title, book.authors.join(", "))} onClose={() => setPlaying(false)} />}
      {video && <VideoPlayer bookId={id} scenes={video.scenes} length={video.length} onClose={() => setVideo(null)} />}

      {showSources && (
        <Modal onClose={() => setShowSources(false)} title="情報源と精度">
          {conf && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-4">
              <div className="card p-2"><div className="text-xs text-muted">総合</div><b>{conf.overall}</b></div>
              <div className="card p-2"><div className="text-xs text-muted">Groundedness</div><b>{conf.groundedness}</b></div>
              <div className="card p-2"><div className="text-xs text-muted">Coverage</div><b>{conf.coverage}</b></div>
              <div className="card p-2"><div className="text-xs text-muted">Source Quality</div><b>{conf.source_quality}</b></div>
              <p className="col-span-full text-xs text-muted">{conf.level_label}：{conf.basis}</p>
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {st.sources.map((s) => (
              <li key={s.id} className="border-b border-line pb-2">
                <div className="flex gap-2 items-center flex-wrap"><span className="text-xs text-muted">{s.ref}</span><span className="text-xs rounded px-1.5 bg-line">Tier {s.tier} {TIER_LABEL[s.tier]}</span><span className="text-xs rounded px-1.5 bg-line">{TYPE_LABEL[s.source_type] ?? s.source_type}</span></div>
                {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline break-all">{s.title ?? s.url}</a> : <span>{s.title}</span>}
                {s.snippet && <p className="text-xs text-muted mt-0.5">{s.snippet}</p>}
              </li>
            ))}
            {st.sources.length === 0 && <li className="text-muted">情報源はまだありません。</li>}
          </ul>
        </Modal>
      )}
      {showReport && <ReportModal bookId={id} onClose={() => setShowReport(false)} />}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3"><h2 className="font-semibold">{title}</h2><button onClick={onClose} className="text-muted">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function ReportModal({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [section, setSection] = useState("");
  const [correct, setCorrect] = useState("");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/books/${bookId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, correct, comment }) });
    setSent(true);
  }
  return (
    <Modal title="内容が違う" onClose={onClose}>
      {sent ? <p>ありがとうございます。報告を受け付けました。</p> : (
        <form onSubmit={submit} className="space-y-3 text-sm">
          <label className="block">どの部分が違う？<input value={section} onChange={(e) => setSection(e.target.value)} className="mt-1 w-full rounded border border-line bg-bg px-3 py-2" placeholder="例：重要ポイント2、章構成" /></label>
          <label className="block">正しい情報<textarea value={correct} onChange={(e) => setCorrect(e.target.value)} className="mt-1 w-full rounded border border-line bg-bg px-3 py-2" rows={3} /></label>
          <label className="block">コメント<textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1 w-full rounded border border-line bg-bg px-3 py-2" rows={2} /></label>
          <button className="rounded-full bg-accent text-white px-4 py-2">送信</button>
        </form>
      )}
    </Modal>
  );
}
