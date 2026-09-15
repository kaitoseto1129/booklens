import type { Metadata } from "next";
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import TabBar from "@/components/TabBar";

const display = Shippori_Mincho({ weight: ["500", "600", "700"], subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "BookLens",
  description: "本から必要な知識だけを即座に取り出して、自分用に使える形にするAI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`h-full antialiased ${display.variable} ${sans.variable}`}>
      <body className="min-h-full flex flex-col app-bg">
        <header className="border-b border-line/70 backdrop-blur-sm sticky top-0 z-20 bg-bg/80">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-display text-xl tracking-tight flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent" /> BookLens
            </Link>
            <nav className="flex gap-6 text-sm text-muted">
              <Link href="/today" className="hover:text-fg transition-colors">今日の1冊</Link>
              <Link href="/library" className="hover:text-fg transition-colors">My Library</Link>
            </nav>
          </div>
        </header>
        <TabBar />
        <main className="flex-1">{children}</main>
        <footer className="text-xs text-muted/80 text-center py-8 px-4">
          要約は公開情報・正規に取得できる情報のみから生成しています。本文の代替ではありません。
        </footer>
      </body>
    </html>
  );
}
