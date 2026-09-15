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

/** 折りたたみ（長文を最初から全部見せない） */
function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-sm text-accent hover:underline">{open ? "閉じる" : label} <span className="text-xs">{open ? "▲" : "▼"}</span></button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

const TOC = [
  { id: "conc", label: "結論" },
  { id: "video", label: "動画で見る" },
  { id: "takeaways", label: "得られる3つ" },
  { id: "points", label: "重要ポイント" },
  { id: "concepts", label: "登場人物・概念" },
  { id: "structure", label: "本の構造" },
  { id: "detail", label: "詳しく読む" },
  { id: "insight", label: "AI INSIGHT" },
  { id: "ask", label: "AIに質問" },
];

export default function BookView({ id, initialLibraryStatus }: { id: string; initialLibraryStatus: string | null }) {
  const [st, setSt] = useState<Status | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [openPoint, setOpenPoint] = useState<number | null>(0);
  const [structTab, setStructTab] = useState<"diagram" | "visual">("diagram");
  const [showSources, setShowSources] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [lib, setLib] = useState<string | null>(initialLibraryStatus);
  const [playing, setPlaying] = useState(false);
  const [video, setVideo] = useState<{ scenes: VideoSceneT[]; length: number } | null>(null);
  const [videoLoading, setVideoLoading] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

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
      <header className="relative flex gap-5 rounded-2xl overflow-hidden p-5 -mx-1">
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
          <h1 className="display text-3xl leading-tight">{book.title}</h1>
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
              <p className="display text-2xl sm:text-[1.9rem] leading-snug">{a.most_important.message}</p>
              <p className="mt-4 text-sm text-muted max-w-2xl">{a.most_important.explanation}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button onClick={() => openVideo(10)} disabled={videoLoading !== null} className="rounded-full bg-accent text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50">▶ 動画で見る</button>
                <button onClick={() => scrollToId("takeaways")} className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent">📖 3分で読む</button>
                <button onClick={() => scrollToId("ask")} className="rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent">✨ AIに質問</button>
                <span className="text-xs rounded-full bg-book-soft text-book px-3 py-2.5 self-center">原著 約{te.origHours}時間 → {te.summaryMin}分</span>
              </div>
            </section>
          ); })()}

          <div className="mt-8 grid lg:grid-cols-[minmax(0,1fr)_240px] gap-8 items-start">
            <main className="space-y-10 min-w-0">
              {/* 動画 */}
              <section id="video">
                <h2 className="font-display text-xl mb-3">動画で理解する</h2>
                <div className="grid grid-cols-3 gap-2">
                  {([5, 10, 20] as const).map((len) => (
                    <button key={len} onClick={() => openVideo(len)} disabled={videoLoading !== null} className="rounded-xl border border-line hover:border-accent p-3 text-center disabled:opacity-50 card-hover">
                      <div className="text-2xl font-display">{len}<span className="text-sm">分</span></div>
                      <div className="text-[11px] text-muted mt-0.5">{len === 5 ? "核心だけ" : len === 10 ? "しっかり" : "詳しく"}</div>
                      {videoLoading === len && <div className="text-[11px] text-accent pulse mt-1">AIが作成中…<br />初回のみ約1分</div>}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button onClick={() => setPlaying(true)} className="text-accent hover:underline">▶ 音声だけで聞く</button>
                  <button onClick={() => openVideo(10, "derived")} disabled={videoLoading !== null} className="text-muted hover:text-fg underline">かんたん版（即時）</button>
                  <button onClick={share} className="text-muted hover:text-fg underline">{copied ? "コピーしました ✓" : "🔗 リンクを共有"}</button>
                </div>
              </section>

              {/* この本から得られる3つ */}
              <section id="takeaways">
                <h2 className="font-display text-xl mb-3">この本から得られる3つ</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  {a.brief30.top3.map((p, i) => (
                    <div key={i} className="card p-4 card-hover"><div className="font-display text-2xl text-accent">{String(i + 1).padStart(2, "0")}</div><div className="font-medium mt-1">{p.title}</div><p className="text-sm text-muted mt-1">{p.body}</p></div>
                  ))}
                </div>
                <p className="mt-3 text-sm"><Tag kind="book" /> <span className="ml-1">{a.brief30.one_liner}</span></p>
                <p className="text-xs text-muted mt-1">誰におすすめ：{a.brief30.for_whom}</p>
              </section>

              {/* 重要ポイント（3段階） */}
              <section id="points">
                <h2 className="font-display text-xl mb-3">重要な{a.key_points.length}つの主張</h2>
                <ol className="space-y-2.5">
                  {a.key_points.map((p, i) => {
                    const lv1 = p.importance >= 5;
                    const open = openPoint === i || lv1;
                    return (
                      <li key={i} className={`rounded-2xl border ${lv1 ? "border-accent/40 bg-accent-soft/40" : "border-line bg-card"} card-hover`}>
                        <button onClick={() => setOpenPoint(openPoint === i ? -1 : i)} className="w-full text-left p-4 flex gap-3 items-start">
                          <span className="font-display text-xl text-accent shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <span className="flex-1">
                            <span className={`font-medium ${lv1 ? "text-lg" : ""}`}>{p.title}</span>
                            <span className="ml-2 inline-block"><Stars n={p.importance} /></span>
                            {lv1 && <span className="ml-2 text-[10px] font-semibold text-accent tracking-wider">必須</span>}
                          </span>
                          {!lv1 && <span className="text-muted text-sm">{open ? "−" : "+"}</span>}
                        </button>
                        {open && <div className={`px-4 pb-4 text-sm ${lv1 ? "" : "-mt-1"}`}><Tag kind="book" /> <span className="ml-1">{p.body}</span><Refs refs={p.evidence} /></div>}
                      </li>
                    );
                  })}
                </ol>
              </section>

              {/* 登場人物・概念 */}
              <section id="concepts">
                <h2 className="font-display text-xl mb-3">登場人物・概念</h2>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {a.brief180.concepts.map((c, i) => (
                    <div key={i} className="card p-3.5"><div className="flex justify-between gap-2 items-baseline"><b>{c.name}</b><Stars n={c.importance} /></div><p className="text-sm text-muted mt-1">{c.description}<Refs refs={c.evidence} /></p></div>
                  ))}
                </div>
              </section>

              {/* 本の構造（図解＋表をタブに集約） */}
              {hasStruct && (
                <section id="structure">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="font-display text-xl">本の構造</h2>
                    <div className="flex gap-1 text-xs">
                      {a.diagrams.length > 0 && <button onClick={() => setStructTab("diagram")} className={`rounded-full px-3 py-1 ${structTab === "diagram" ? "bg-fg text-bg" : "border border-line text-muted"}`}>図で理解</button>}
                      {analysis?.visuals && analysis.visuals.length > 0 && <button onClick={() => setStructTab("visual")} className={`rounded-full px-3 py-1 ${structTab === "visual" ? "bg-fg text-bg" : "border border-line text-muted"}`}>表で理解</button>}
                    </div>
                  </div>
                  {structTab === "diagram" && a.diagrams.length > 0 && <div className="grid gap-4">{a.diagrams.map((d, i) => <Mermaid key={i} code={d.mermaid} title={d.title} caption={d.caption} />)}</div>}
                  {structTab === "visual" && analysis?.visuals && analysis.visuals.length > 0 && <Visuals visuals={analysis.visuals} />}
                </section>
              )}

              {/* 詳しく読む（折りたたみ） */}
              <section id="detail">
                <h2 className="font-display text-xl mb-3">詳しく読む</h2>
                <div className="card p-5 space-y-4">
                  <div><h3 className="font-semibold mb-1">この本の問題意識</h3><p className="text-sm">{a.brief180.problem}</p></div>
                  <div><h3 className="font-semibold mb-1">著者の結論</h3><p className="text-sm">{a.brief180.conclusion}</p></div>
                  <Collapsible label="背景・著者・章構成・応用をもっと読む">
                    <div className="space-y-4 text-sm">
                      <div><h3 className="font-semibold mb-1">本の背景</h3><p>{a.detail.background}</p></div>
                      <div className="flex gap-4">
                        {book.author_image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={book.author_image} alt="" className="w-20 h-20 object-cover rounded-lg shrink-0 border border-line" />
                        )}
                        <div><h3 className="font-semibold mb-1">著者について</h3><p>{a.detail.about_author}</p></div>
                      </div>
                      <div><h3 className="font-semibold mb-1">中心的な問い</h3><p>{a.detail.central_question}</p></div>
                      <div><h3 className="font-semibold mb-1">著者の主張</h3><ul className="list-disc pl-5 space-y-1">{a.detail.claims.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                      {a.detail.examples.length > 0 && <div><h3 className="font-semibold mb-1">具体例</h3><ul className="list-disc pl-5 space-y-1">{a.detail.examples.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
                      <div>
                        <h3 className="font-semibold mb-1">章構成 {a.detail.chapters_verified && <span className="text-xs text-muted font-normal">（目次を確認済み）</span>}</h3>
                        {a.detail.chapters.length > 0
                          ? <ol className="space-y-2">{a.detail.chapters.map((c) => <li key={c.number} className="border-l-2 border-line pl-3"><b>第{c.number}章 {c.title}</b><p className="text-muted mt-0.5">{c.summary}</p></li>)}</ol>
                          : <p className="text-muted">{a.detail.chapters_note || "章ごとの詳細は十分取得できませんでした。"}</p>}
                      </div>
                      {a.detail.critiques.length > 0 && <div><h3 className="font-semibold mb-1"><Tag kind="book" /> 批判・限界</h3><ul className="list-disc pl-5 space-y-1">{a.detail.critiques.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
                      <div><h3 className="font-semibold mb-1">応用方法</h3><ul className="list-disc pl-5 space-y-1">{a.detail.applications.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
                    </div>
                  </Collapsible>
                </div>
              </section>

              {/* 自分向けに変換 */}
              <PersonaBox bookId={id} />

              {/* 今日から / なぜ重要 */}
              <section className="grid sm:grid-cols-2 gap-4">
                <div className="card p-5"><div className="text-xs font-medium text-accent mb-1">今日から使える1つ</div><p className="font-medium">{a.today_action.action}</p><p className="text-sm text-muted mt-1">{a.today_action.why}</p></div>
                <div className="card p-5"><div className="text-xs font-medium text-accent mb-1">なぜこの本が重要か</div><p className="text-sm">{a.why_care}</p></div>
              </section>

              {/* 復習・クイズ */}
              <section id="review" className="card p-5 space-y-4">
                <h2 className="font-display text-lg">覚える・実践する</h2>
                <div><h3 className="font-medium text-sm text-muted mb-1">この本を読んだ後にやること</h3><ol className="list-decimal pl-5 space-y-1 text-sm">{a.action_items.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
                <Quiz bookId={id} />
              </section>

              {/* AI INSIGHT */}
              <section id="insight" className="card p-5 space-y-3 border-insight/40">
                <div className="flex items-center gap-2"><Tag kind="insight" /><span className="text-xs text-muted">本の内容ではなく、AIによる応用・解釈・反論</span></div>
                {a.ai_insight.applications.length > 0 && <div><h3 className="font-medium mb-1">応用の視点</h3><ul className="list-disc pl-5 space-y-1 text-sm">{a.ai_insight.applications.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                {a.ai_insight.counterarguments.length > 0 && <div><h3 className="font-medium mb-1">反論・弱点</h3><ul className="list-disc pl-5 space-y-1 text-sm">{a.ai_insight.counterarguments.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                {a.ai_insight.evidence_check && <div><h3 className="font-medium mb-1">Evidence Check</h3><p className="text-sm">{a.ai_insight.evidence_check}</p></div>}
              </section>

              {a.quotes.length > 0 && (
                <section><h2 className="font-display text-xl mb-3">印象的な引用</h2><ul className="space-y-2">{a.quotes.map((q, i) => <li key={i} className="border-l-2 border-accent pl-3 text-sm italic">“{q.text}” <span className="not-italic text-xs text-muted">({q.evidence})</span></li>)}</ul></section>
              )}

              {(a.unverified.length > 0 || a.conflicts.length > 0) && (
                <Collapsible label="確認できていない点・資料の食い違いを見る">
                  <div className="text-sm text-muted space-y-2">
                    {a.unverified.length > 0 && <div><b>確認できていない点：</b><ul className="list-disc pl-5">{a.unverified.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                    {a.conflicts.length > 0 && <div><b>資料によって説明が異なる点：</b><ul className="list-disc pl-5">{a.conflicts.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
                  </div>
                </Collapsible>
              )}

              {/* AIに質問 */}
              <section id="ask"><Chat bookId={id} ready={done} /></section>

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
              <button onClick={() => scrollToId("ask")} className="card card-hover w-full text-left p-4">
                <div className="text-sm font-medium">✨ この本について質問</div>
                <div className="text-xs text-muted mt-0.5">分からない所をAIに聞く</div>
              </button>
            </aside>
          </div>
        </>
      )}

      {/* フローティングAIボタン */}
      {done && (
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
