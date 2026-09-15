"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Compare } from "@/lib/ai/schemas";

export default function CompareView({ ids }: { ids: string[] }) {
  const [res, setRes] = useState<Compare | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/compare?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((d: { result?: Compare; error?: string }) => { if (d.error) setErr(d.error); else setRes(d.result ?? null); })
      .catch((e) => setErr(String(e)));
  }, [ids]);

  if (err) return <div className="mx-auto max-w-3xl px-4 py-12"><p className="text-accent text-sm">{err}</p><Link href="/" className="underline text-sm">戻る</Link></div>;
  if (!res) return <div className="mx-auto max-w-3xl px-4 py-16 text-muted pulse">複数の本を比較しています…（20〜40秒）</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">本を比較</h1>
      <p className="text-sm text-muted">{res.titles.join(" ／ ")}</p>
      <section className="card p-5 bg-accent-soft/30 border-accent/40"><div className="text-xs text-accent mb-1">一言でいうと</div><p className="text-lg font-medium">{res.tldr}</p></section>

      <section><h2 className="font-semibold mb-2">共通して言っていること</h2><ul className="list-disc pl-5 space-y-1 text-sm">{res.common.map((c, i) => <li key={i}>{c}</li>)}</ul></section>

      <section>
        <h2 className="font-semibold mb-2">観点ごとの違い</h2>
        <div className="space-y-3">
          {res.differences.map((d, i) => (
            <div key={i} className="card p-3">
              <div className="text-sm font-medium mb-1.5">{d.aspect}</div>
              <div className="grid gap-1.5">{d.positions.map((p, j) => <div key={j} className="text-sm flex gap-2"><span className="text-muted shrink-0 w-32 truncate">{p.book}</span><span>{p.stance}</span></div>)}</div>
            </div>
          ))}
        </div>
      </section>

      {res.disagreements.length > 0 && <section><h2 className="font-semibold mb-2">意見が対立する点</h2><ul className="list-disc pl-5 space-y-1 text-sm">{res.disagreements.map((d, i) => <li key={i}>{d}</li>)}</ul></section>}

      <section className="card p-5"><div className="text-xs font-medium text-accent mb-1">どれから読むべき？</div><p className="text-sm">{res.which_first}</p></section>

      <section><h2 className="font-semibold mb-2">目的別おすすめ</h2><div className="space-y-1.5">{res.use_cases.map((u, i) => <div key={i} className="text-sm flex gap-2"><span className="text-muted shrink-0">{u.situation}：</span><b>{u.pick}</b></div>)}</div></section>
    </div>
  );
}
