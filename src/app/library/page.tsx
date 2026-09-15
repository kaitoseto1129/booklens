import Link from "next/link";
import { listLibrary } from "@/lib/db";
import LibraryAsk from "@/components/LibraryAsk";

export const dynamic = "force-dynamic";
const LABEL: Record<string, string> = { want: "読みたい", reading: "読んでいる", done: "読了", summary_only: "要約だけ読んだ" };

export default function LibraryPage() {
  const rows = listLibrary();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">My Library</h1>
      {rows.length > 0 && <LibraryAsk />}
      {rows.length === 0 ? (
        <p className="text-muted">まだ保存した本はありません。書籍ページの「ライブラリに保存」から追加できます。</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.id}`} className="card flex gap-4 p-3 hover:border-accent">
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.cover_url} alt="" className="w-12 h-16 object-cover rounded" />
                ) : (
                  <div className="w-12 h-16 rounded bg-line" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.title}</div>
                  <div className="text-xs text-muted">{(JSON.parse(b.authors) as string[]).join(", ")}</div>
                </div>
                <span className="text-xs self-center rounded-full px-2 py-1 bg-accent-soft text-accent">{LABEL[b.status] ?? b.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
