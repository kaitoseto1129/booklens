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
import type { VideoSceneT } from "@/lib/ai/schemas";
import { singleBookSlides, timeEstimate } from "@/lib/slides";
import type { VisualBlockT } from "@/lib/ai/schemas";
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

function Stars({ n }: { n: number }) {
  const v = Math.max(1, Math.min(5, Math.round(n)));
  const label = ["", "読み飛ばし可", "具体例", "補足", "重要", "必須"][v];
  return <span className="text-xs text-muted" title={label}>{"★".repeat(v)}{"☆".repeat(5 - v)} <span className="ml-1">{label}</span></span>;
}
const Tag = ({ kind }: { kind: "book" | "insight" }) => (
  <span className={`text-[10px] font-semibold tracking-wider rounded px-1.5 py-0.5 ${kind === "book" ? "tag-book" : "tag-insight"}`}>{kind === "book" ? "BOOK" : "AI INSIGHT"}</span>
);
const Refs = ({ refs }: { refs?: string[] }) => (refs && refs.length ? <span className="text-[11px] text-muted ml-1">({refs.join(", ")})</span> : null);

export default function BookView({ id, initialLibraryStatus }: { id: string; initialLibraryStatus: string | null }) {
  const [st, setSt] = useState<Status | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [tab, setTab] = useState<"30" | "180" | "detail">("30");
  const [openPoint, setOpenPoint] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [lib, setLib] = useState<string | null>(initialLibraryStatus);
  const [mode, setMode] = useState<"before" | "after">("before");
  const [playing, setPlaying] = useState(false);
  const [video, setVideo] = useState<{ scenes: VideoSceneT[]; length: number } | null>(null);
  const [videoLoading, setVideoLoading] = useState<number | null>(null);
  async function openVideo(len: 5 | 10 | 20, mode: "auto" | "derived" = "auto") {
    setVideoLoading(len);
    try {
      const r = await fetch(`/api/books/${id}/video?length=${len}&mode=${mode}`);
      const d = (await r.json()) as { scenes?: VideoSceneT[]; length?: number; error?: string };
      if (d.scenes) setVideo({ scenes: d.scenes, length: d.length ?? len });
    } finally { setVideoLoading(null); }
  }
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) { await navigator.share({ title: st?.book.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* ユーザーがキャンセル等 */ }
  }

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { upsertTab({ id, title: "", cover: null }); }, [id]);

  // 状態取得＋生成中はポーリング（副作用内では setState を直接呼ばず、fetch 完了後に反映する）
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const r = await fetch(`/api/books/${id}/status`, { cache: "no-store" });
      if (!r.ok || cancelled) return;
      const data = (await r.json()) as Status;
      if (cancelled) return;
      if (!data.analysis) {
        await fetch(`/api/books/${id}/generate`, { method: "POST" });
        timer = setTimeout(poll, 800);
        return;
      }
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
    const d = (await r.json()) as { status: string | null };
    setLib(d.status);
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
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
        ) : (
          <div className="w-24 h-36 rounded-lg bg-line shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="display text-3xl leading-tight">{book.title}</h1>
          {book.subtitle && <p className="text-muted">{book.subtitle}</p>}
          {book.original_title && <p className="text-xs text-muted">原題: {book.original_title}</p>}
          <p className="mt-1 text-sm flex items-center gap-2">
            {book.author_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.author_image} alt="" className="w-6 h-6 rounded-full object-cover" />
            )}
            <span>{book.authors.join(", ")}{book.published_year ? ` · ${book.published_year}` : ""}{book.publisher ? ` · ${book.publisher}` : ""}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {conf ? (
              <button onClick={() => setShowSources(true)} className="text-xs rounded-full border border-line px-3 py-1 hover:border-accent" title={conf.basis}>
                情報精度：<b>{conf.level_label}</b> <span className="text-muted">{conf.overall}%</span>
              </button>
            ) : (
              <span className="text-xs rounded-full border border-line px-3 py-1 text-muted">情報精度：確認中</span>
            )}
            {done && <button onClick={() => setShowSources(true)} className="text-xs rounded-full border border-line px-3 py-1 hover:border-accent">情報源 {st.sources.length}</button>}
            <select value={lib ?? ""} onChange={(e) => saveLib(e.target.value || null)} className="text-xs rounded-full border border-line bg-card px-3 py-1">
              <option value="">ライブラリに保存…</option>
              {Object.entries(LIB_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {lib && <span className="text-xs text-accent">保存済み（{LIB_LABEL[lib]}）</span>}
          </div>
        </div>
      </header>

      {/* 進捗 */}
      {analysis && analysis.status !== "done" && (
        analysis.status === "error" ? (
          <div className="card p-4">
            <p className="text-sm text-accent">生成に失敗しました：{analysis.error}</p>
            <button onClick={regenerate} className="mt-2 text-sm underline">もう一度試す</button>
          </div>
        ) : (
          <ProgressPanel eta={st.eta} stepLabel={analysis.step_label} progress={analysis.progress} receivedAt={receivedAt} quickShown={Boolean(analysis.quick)} />
        )
      )}

      {/* 速報版 */}
      {!done && analysis?.quick && (
        <section className="card p-5 border-dashed">
          <div className="flex items-center gap-2 mb-2"><span className="text-xs rounded px-1.5 py-0.5 bg-accent-soft text-accent">速報版・確認中</span><span className="text-xs text-muted">{analysis.quick.note}</span></div>
          <p className="text-lg font-medium">{analysis.quick.one_liner}</p>
          <ol className="mt-3 space-y-2 list-decimal pl-5">
            {analysis.quick.top3.map((p, i) => <li key={i}><b>{p.title}</b> — {p.body}</li>)}
          </ol>
          <p className="mt-3 text-sm text-muted">誰におすすめ：{analysis.quick.for_whom}</p>
        </section>
      )}

      {done && a && (
        <>
          {/* 動画で理解する（5/10/20分） */}
          {(() => {
            const te = timeEstimate(a, book.pages);
            return (
              <section className="card p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-display text-xl">動画で理解する</h2>
                  <span className="text-xs text-muted">ナレーション・字幕・図解つき</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([5, 10, 20] as const).map((len) => (
                    <button key={len} onClick={() => openVideo(len)} disabled={videoLoading !== null} className="rounded-xl border border-line hover:border-accent p-3 text-center disabled:opacity-50 card-hover">
                      <div className="text-2xl font-display">{len}<span className="text-sm">分</span></div>
                      <div className="text-[11px] text-muted mt-0.5">{len === 5 ? "核心だけ" : len === 10 ? "しっかり理解" : "詳しく"}</div>
                      {videoLoading === len && <div className="text-[11px] text-accent pulse mt-1">AIが図解動画を作成中…<br/>初回のみ・約1分</div>}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => setPlaying(true)} className="text-sm text-accent hover:underline">▶ 音声だけで聞く</button>
                  <button onClick={() => openVideo(10, "derived")} disabled={videoLoading !== null} className="text-xs text-muted hover:text-fg underline">かんたん版（即時）</button>
                  <span className="text-xs rounded-full bg-book-soft text-book px-3 py-1.5">原著 約{te.origHours}時間 → 動画 {5}〜{20}分</span>
                  <button onClick={share} className="text-xs rounded-full border border-line px-3 py-1.5 hover:border-accent">{copied ? "コピーしました ✓" : "🔗 リンク"}</button>
                </div>
              </section>
            );
          })()}

          {/* 一番大事なこと */}
          <section className="card p-6 border-accent/30 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-accent/80" />
            <div className="text-[11px] font-medium text-accent tracking-widest uppercase mb-2">この本で一番大事なこと</div>
            <p className="display text-2xl leading-snug">{a.most_important.message}</p>
            <p className="mt-3 text-sm text-muted">{a.most_important.explanation}</p>
          </section>

          {/* ひと目でわかる（構造化ビジュアル） */}
          {analysis?.visuals && analysis.visuals.length > 0 && (
            <section>
              <h2 className="font-display text-xl mb-3">ひと目でわかる</h2>
              <Visuals visuals={analysis.visuals} />
            </section>
          )}

          {/* 読む前/読んだ後 モード */}
          <div className="flex gap-1 text-sm">
            <button onClick={() => setMode("before")} className={`rounded-full px-3 py-1 ${mode === "before" ? "bg-fg text-bg" : "border border-line"}`}>読む前</button>
            <button onClick={() => setMode("after")} className={`rounded-full px-3 py-1 ${mode === "after" ? "bg-fg text-bg" : "border border-line"}`}>読んだ後</button>
          </div>

          {/* タブ */}
          <div className="border-b border-line flex gap-6 text-sm">
            {([["30", "30秒で理解"], ["180", "3分で理解"], ["detail", "詳しく読む"]] as const).map(([k, v]) => (
              <button key={k} onClick={() => setTab(k)} className={`pb-2.5 -mb-px border-b-2 transition-colors ${tab === k ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}>{v}</button>
            ))}
          </div>

          {tab === "30" && (
            <section className="space-y-4">
              <p className="text-lg font-medium leading-relaxed"><Tag kind="book" /> {a.brief30.one_liner}</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {a.brief30.top3.map((p, i) => (
                  <div key={i} className="card p-4"><div className="text-xs text-muted mb-1">{i + 1}</div><div className="font-medium">{p.title}</div><p className="text-sm mt-1">{p.body}</p></div>
                ))}
              </div>
              <p className="text-sm"><span className="text-muted">誰におすすめ：</span>{a.brief30.for_whom}</p>
            </section>
          )}

          {tab === "180" && (
            <section className="space-y-5">
              <div><h3 className="font-semibold mb-1">この本の問題意識</h3><p>{a.brief180.problem}</p></div>
              <div><h3 className="font-semibold mb-1">著者の結論</h3><p>{a.brief180.conclusion}</p></div>
              <div>
                <h3 className="font-semibold mb-2">重要概念</h3>
                <ul className="space-y-2">
                  {a.brief180.concepts.map((c, i) => (
                    <li key={i} className="card p-3"><div className="flex justify-between gap-2"><b>{c.name}</b><Stars n={c.importance} /></div><p className="text-sm mt-1">{c.description}<Refs refs={c.evidence} /></p></li>
                  ))}
                </ul>
              </div>
              {a.brief180.examples.length > 0 && <div><h3 className="font-semibold mb-1">代表的な具体例</h3><ul className="list-disc pl-5 space-y-1">{a.brief180.examples.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              <div><h3 className="font-semibold mb-1">持ち帰るべきこと</h3><ul className="list-disc pl-5 space-y-1">{a.brief180.takeaways.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
            </section>
          )}

          {tab === "detail" && (
            <section className="space-y-5">
              <div><h3 className="font-semibold mb-1">本の背景</h3><p>{a.detail.background}</p></div>
              <div>
                <h3 className="font-semibold mb-1">著者について</h3>
                <div className="flex gap-4">
                  {book.author_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.author_image} alt={book.authors[0] ?? ""} className="w-24 h-24 object-cover rounded-lg shrink-0 border border-line" />
                  )}
                  <p>{a.detail.about_author}</p>
                </div>
              </div>
              <div><h3 className="font-semibold mb-1">中心的な問い</h3><p>{a.detail.central_question}</p></div>
              <div><h3 className="font-semibold mb-1">著者の主張</h3><ul className="list-disc pl-5 space-y-1">{a.detail.claims.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
              <div>
                <h3 className="font-semibold mb-2">重要概念</h3>
                <ul className="space-y-2">{a.detail.concepts.map((c, i) => <li key={i} className="card p-3"><div className="flex justify-between gap-2"><b>{c.name}</b><Stars n={c.importance} /></div><p className="text-sm mt-1">{c.description}<Refs refs={c.evidence} /></p></li>)}</ul>
              </div>
              {a.detail.examples.length > 0 && <div><h3 className="font-semibold mb-1">具体例</h3><ul className="list-disc pl-5 space-y-1">{a.detail.examples.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              <div>
                <h3 className="font-semibold mb-1">章構成 {a.detail.chapters_verified ? <span className="text-xs text-muted font-normal">（目次を情報源で確認済み）</span> : null}</h3>
                {a.detail.chapters.length > 0 ? (
                  <ol className="space-y-2">{a.detail.chapters.map((c) => <li key={c.number} className="card p-3"><b>第{c.number}章 {c.title}</b><p className="text-sm mt-1">{c.summary}</p></li>)}</ol>
                ) : (
                  <p className="text-sm text-muted">{a.detail.chapters_note || "章ごとの詳細情報は十分取得できませんでした。"}</p>
                )}
                {a.detail.chapters.length > 0 && a.detail.chapters_note && <p className="text-xs text-muted mt-1">{a.detail.chapters_note}</p>}
              </div>
              <div><h3 className="font-semibold mb-1">最終結論</h3><p>{a.detail.conclusion}</p></div>
              {a.detail.critiques.length > 0 && <div><h3 className="font-semibold mb-1"><Tag kind="book" /> 批判・限界（情報源より）</h3><ul className="list-disc pl-5 space-y-1">{a.detail.critiques.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
              <div><h3 className="font-semibold mb-1">応用方法</h3><ul className="list-disc pl-5 space-y-1">{a.detail.applications.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
              {a.quotes.length > 0 && (
                <div><h3 className="font-semibold mb-1">引用</h3>
                  <ul className="space-y-2">{a.quotes.map((q, i) => <li key={i} className="border-l-2 border-accent pl-3 text-sm italic">“{q.text}” <span className="not-italic text-xs text-muted">({q.evidence})</span></li>)}</ul>
                </div>
              )}
            </section>
          )}

          {/* 図解 */}
          {a.diagrams.length > 0 && (
            <section>
              <h2 className="font-display text-xl mb-3">図解で理解する</h2>
              <div className="grid gap-4">{a.diagrams.map((d, i) => <Mermaid key={i} code={d.mermaid} title={d.title} caption={d.caption} />)}</div>
            </section>
          )}

          {/* 重要ポイント5つ */}
          <section>
            <h2 className="font-display text-xl mb-3">{mode === "before" ? "読む前に知っておくべき5つ" : "重要ポイント5つ"}</h2>
            <ol className="space-y-2">
              {a.key_points.map((p, i) => (
                <li key={i} className="card card-hover">
                  <button onClick={() => setOpenPoint(openPoint === i ? null : i)} className="w-full text-left p-4 flex gap-3 items-start">
                    <span className="text-accent font-semibold">{i + 1}.</span>
                    <span className="flex-1"><span className="font-medium">{p.title}</span><div className="mt-0.5"><Stars n={p.importance} /></div></span>
                    <span className="text-muted text-sm">{openPoint === i ? "−" : "+"}</span>
                  </button>
                  {openPoint === i && <div className="px-4 pb-4 text-sm"><Tag kind="book" /> {p.body}<Refs refs={p.evidence} /></div>}
                </li>
              ))}
            </ol>
          </section>

          {/* 読んだ後モード：復習・実践 */}
          {mode === "after" && (
            <section className="card p-5 space-y-4">
              <h2 className="font-semibold text-lg">復習と実践</h2>
              <div><h3 className="font-medium text-sm text-muted mb-1">覚えておくべきこと</h3><ul className="list-disc pl-5 space-y-1">{a.brief180.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
              <div><h3 className="font-medium text-sm text-muted mb-1">実践項目</h3><ol className="list-decimal pl-5 space-y-1">{a.action_items.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
              <Quiz bookId={id} />
            </section>
          )}

          {/* 今日から / アクション / Why care */}
          <section className="grid sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="text-xs font-medium text-accent mb-1">今日から使える1つ</div>
              <p className="font-medium">{a.today_action.action}</p>
              <p className="text-sm text-muted mt-1">{a.today_action.why}</p>
            </div>
            <div className="card p-5">
              <div className="text-xs font-medium text-accent mb-1">この本を読んだ後にやること</div>
              <ol className="list-decimal pl-5 space-y-1 text-sm">{a.action_items.map((t, i) => <li key={i}>{t}</li>)}</ol>
            </div>
          </section>
          <section className="card p-5">
            <div className="text-xs font-medium text-accent mb-1">なぜこの本が重要なのか？</div>
            <p>{a.why_care}</p>
          </section>

          {/* #4 自分向けに変換 */}
          <PersonaBox bookId={id} />

          {/* AI INSIGHT */}
          <section className="card p-5 space-y-3 border-insight/40">
            <div className="flex items-center gap-2"><Tag kind="insight" /><span className="text-xs text-muted">本に書かれている内容ではなく、AIによる応用・解釈・反論</span></div>
            {a.ai_insight.applications.length > 0 && <div><h3 className="font-medium mb-1">応用の視点</h3><ul className="list-disc pl-5 space-y-1 text-sm">{a.ai_insight.applications.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
            {a.ai_insight.counterarguments.length > 0 && <div><h3 className="font-medium mb-1">反論・弱点</h3><ul className="list-disc pl-5 space-y-1 text-sm">{a.ai_insight.counterarguments.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
            {a.ai_insight.evidence_check && <div><h3 className="font-medium mb-1">Evidence Check</h3><p className="text-sm">{a.ai_insight.evidence_check}</p></div>}
          </section>

          {/* 確認できなかったこと */}
          {(a.unverified.length > 0 || a.conflicts.length > 0) && (
            <section className="text-sm text-muted space-y-2">
              {a.unverified.length > 0 && <div><b>確認できていない点：</b><ul className="list-disc pl-5">{a.unverified.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
              {a.conflicts.length > 0 && <div><b>資料によって説明が異なる点：</b><ul className="list-disc pl-5">{a.conflicts.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
            </section>
          )}

          <Chat bookId={id} ready={done} />

          <div className="flex flex-wrap gap-4 text-xs text-muted pt-2">
            <button onClick={() => setShowReport(true)} className="underline">内容が違う</button>
            <button onClick={regenerate} className="underline">最新情報で再生成</button>
            <span>v{analysis?.version} · {book.source_type === "A" ? "本文ベース" : "公開情報ベース"}</span>
            {analysis?.timeline && analysis.timeline.length > 0 && analysis.timeline[analysis.timeline.length - 1].ended_at && (() => { const t = analysis.timeline!; const ms = t[t.length - 1].ended_at! - t[0].started_at; return <span>生成 {Math.floor(ms / 60000)}分{Math.round((ms % 60000) / 1000)}秒</span>; })()}
            {analysis?.usage && <span>tokens in {(analysis.usage.input + analysis.usage.cacheRead + analysis.usage.cacheWrite).toLocaleString()} / out {analysis.usage.output.toLocaleString()}</span>}
          </div>
        </>
      )}

      {playing && a && <SlidePlayer slides={singleBookSlides(a, book.title, book.authors.join(", "))} onClose={() => setPlaying(false)} />}
      {video && <VideoPlayer bookId={id} scenes={video.scenes} length={video.length} onClose={() => setVideo(null)} />}

      {/* 情報源モーダル */}
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
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-xs text-muted">{s.ref}</span>
                  <span className="text-xs rounded px-1.5 bg-line">Tier {s.tier} {TIER_LABEL[s.tier]}</span>
                  <span className="text-xs rounded px-1.5 bg-line">{TYPE_LABEL[s.source_type] ?? s.source_type}</span>
                </div>
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
