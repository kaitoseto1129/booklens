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
        <p className="mt-4 text-muted text-base sm:text-lg max-w-lg mx-auto">悩みを入れれば複数の本から答えを。タイトルを入れれば図解つき要約を。</p>
        <div className="mt-8">
          <HomeSearch />
        </div>
        <p className="mt-4 text-xs text-muted">
          初めての本：速報版が約{quick}秒、完全版は約{total}分（Web収集→要約→事実確認）／ 一度調べた本：即表示
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
