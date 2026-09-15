import Link from "next/link";
import { pickTodayBook, latestAnalysis } from "@/lib/db";
import type { Analysis } from "@/lib/ai/schemas";
import TodayPlayer from "@/components/TodayPlayer";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  const book = pickTodayBook();
  const a = book ? latestAnalysis(book.id) : undefined;
  const content = a?.content ? (JSON.parse(a.content) as Analysis) : null;
  if (!book || !content) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold mb-2">今日の1冊</h1>
        <p className="text-muted">まだ解説できる本がありません。<Link href="/" className="underline text-accent">本を検索</Link>して要約を作り、ライブラリに保存してください。</p>
      </div>
    );
  }
  return (
    <TodayPlayer
      id={book.id}
      title={book.title}
      authors={(JSON.parse(book.authors) as string[]).join(", ")}
      cover={book.cover_url}
      oneLiner={content.brief30.one_liner}
      message={content.most_important.message}
    />
  );
}
