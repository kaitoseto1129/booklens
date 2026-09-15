import Link from "next/link";
import CompareView from "@/components/CompareView";

export const dynamic = "force-dynamic";

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const raw = typeof sp.ids === "string" ? sp.ids : Array.isArray(sp.ids) ? sp.ids.join(",") : "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  if (ids.length < 2) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold mb-2">本を比較</h1><p className="text-muted">2冊以上をタブで開いて「比較」を押してください。</p><Link href="/" className="underline text-accent text-sm">トップへ</Link></div>;
  }
  return <CompareView ids={ids} />;
}
