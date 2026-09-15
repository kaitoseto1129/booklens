import Link from "next/link";
import { popularBooks } from "@/lib/db";
import HomeSearch from "@/components/HomeSearch";
import { estimateTotalSeconds, estimateQuickSeconds } from "@/lib/eta";

export const dynamic = "force-dynamic";

export default function Home() {
  const popular = popularBooks(8);
  const total = Math.max(1, Math.round(estimateTotalSeconds() / 60));
  const quick = estimateQuickSeconds();
  return (
    <div className="mx-auto max-w-3xl px-4">
      <section className="pt-20 sm:pt-28 pb-12 text-center fade-up">
        <h1 className="display text-4xl sm:text-5xl leading-tight">本から、必要な知識だけを。</h1>
        <p className="mt-4 text-muted text-base sm:text-lg max-w-lg mx-auto">本のタイトルを入れるだけ。AIが要約・図解・動画にまとめ、あなたの状況にまで当てはめます。</p>
        <div className="mt-8">
          <HomeSearch />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-muted">
          {[["📖", "要点をやさしく要約"], ["📊", "図解でスッと理解"], ["🎬", "動画・音声で聴く"], ["✨", "自分・自社に当てはめる"]].map(([icon, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5"><span>{icon}</span>{label}</span>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted/80">
          はじめての本：要点は約{quick}秒で先に表示、くわしい完全版は約{total}分（Webで調べて→要約→事実確認）。一度調べた本はすぐ開けます。
        </p>
      </section>

      {popular.length > 0 && (
        <section className="pb-16">
          <h2 className="text-xs font-medium text-muted/80 tracking-widest uppercase mb-3">最近見られている本</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {popular.map((b) => {
              const authors = JSON.parse(b.authors) as string[];
              return (
                <li key={b.id}>
                  <Link href={`/books/${b.id}`} className="card card-hover block p-3 h-full">
                    <div className="flex gap-3">
                      {b.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.cover_url} alt="" className="w-10 h-14 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-14 rounded bg-line" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-snug line-clamp-2 font-display">{b.title}</div>
                        <div className="text-xs text-muted truncate">{authors.join(", ")}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
