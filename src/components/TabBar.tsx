"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { readTabs, removeTab, onTabsChange, type Tab } from "@/lib/tabs";
import MultiExplainer from "./MultiExplainer";

export default function TabBar() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const activeId = pathname.startsWith("/books/") ? pathname.split("/")[2] : null;
  const onSearch = pathname === "/";
  const [digest, setDigest] = useState(false);

  useEffect(() => {
    const unsub = onTabsChange(() => setTabs(readTabs()));
    // 初期読み込みは次フレームに遅延（effect内の同期setStateを避ける）
    const raf = requestAnimationFrame(() => { setTabs(readTabs()); setMounted(true); });
    return () => { unsub(); cancelAnimationFrame(raf); };
  }, []);

  function close(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const rest = removeTab(id);
    if (id === activeId) router.push(rest.length ? `/books/${rest[rest.length - 1].id}` : "/");
  }

  // タブが無い間は何も出さない（SSRとの不一致を避けるため mounted 後のみ）
  if (!mounted || (tabs.length === 0 && !activeId)) return null;

  return (
    <div className="border-b border-line bg-card/60 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-5xl px-2 flex items-stretch gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <Link
              key={t.id}
              href={`/books/${t.id}`}
              className={`group flex items-center gap-2 pl-3 pr-2 py-2 text-sm whitespace-nowrap border-b-2 max-w-[220px] ${active ? "border-accent font-medium" : "border-transparent text-muted hover:text-fg"}`}
            >
              {t.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.cover.replace("-L.jpg", "-S.jpg")} alt="" className="w-4 h-6 object-cover rounded-sm shrink-0" />
              ) : null}
              <span className="truncate">{t.title || "読み込み中…"}</span>
              <button
                onClick={(e) => close(e, t.id)}
                className="ml-1 w-4 h-4 rounded-full text-muted opacity-60 hover:opacity-100 hover:bg-line shrink-0 leading-none"
                title="閉じる"
                aria-label="タブを閉じる"
              >
                ×
              </button>
            </Link>
          );
        })}
        <Link
          href="/"
          className={`flex items-center px-3 py-2 text-sm shrink-0 ${onSearch ? "text-accent font-medium" : "text-muted hover:text-fg"}`}
          title="新しいタブで本を検索"
        >
          ＋
        </Link>
        {tabs.length >= 2 && (
          <div className="ml-auto my-1 flex items-center gap-1 shrink-0">
            <Link href={`/compare?ids=${tabs.map((t) => t.id).join(",")}`} className="text-xs rounded-full border border-line px-3 py-1 hover:border-accent" title="開いている本を比較">⚖️ 比較</Link>
            <button onClick={() => setDigest(true)} className="text-xs rounded-full bg-accent text-white px-3 py-1 hover:opacity-90" title="開いている本をまとめて音声解説">▶ {tabs.length}冊まとめて解説</button>
          </div>
        )}
      </div>
      {digest && <MultiExplainer ids={tabs.map((t) => t.id)} onClose={() => setDigest(false)} />}
    </div>
  );
}
