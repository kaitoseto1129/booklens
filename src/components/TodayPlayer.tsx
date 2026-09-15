"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SlidePlayer, { type Slide } from "./SlidePlayer";
import { singleBookSlides } from "@/lib/slides";
import type { Analysis } from "@/lib/ai/schemas";

export default function TodayPlayer(props: { id: string; title: string; authors: string; cover: string | null; oneLiner: string; message: string }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    fetch(`/api/books/${props.id}/status`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { analysis?: { content: Analysis | null } }) => {
        if (d.analysis?.content) setSlides(singleBookSlides(d.analysis.content, props.title, props.authors));
      });
  }, [props.id, props.title, props.authors]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-xs tracking-widest text-accent mb-2">今日の1冊 · 復習</div>
      <div className="card p-6 flex gap-5 items-center">
        {props.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.cover} alt="" className="w-24 h-36 object-cover rounded-lg shadow-sm shrink-0" />
        ) : <div className="w-24 h-36 rounded-lg bg-line shrink-0" />}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">{props.title}</h1>
          <p className="text-sm text-muted">{props.authors}</p>
          <p className="text-sm mt-3">{props.oneLiner}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={() => setPlaying(true)} disabled={!slides} className="flex items-center gap-2 rounded-full bg-accent text-white px-6 py-3 font-medium shadow-sm hover:opacity-90 disabled:opacity-50">
          <span>▶</span> 今日の解説を再生（音声つき）
        </button>
        <Link href={`/books/${props.id}`} className="rounded-full border border-line px-5 py-3 text-sm hover:border-accent self-center">本のページを開く</Link>
      </div>
      <p className="mt-4 text-sm text-muted">1日1冊、聞き流すだけで記憶に定着させる復習モードです。</p>
      {playing && slides && <SlidePlayer slides={slides} onClose={() => setPlaying(false)} />}
    </div>
  );
}
