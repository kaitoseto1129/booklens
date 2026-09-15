"use client";
import { useState } from "react";
import { loadContext, saveContext, emptyContext, CONTEXT_FIELDS, type MyContext } from "@/lib/context";

const TYPES: { k: MyContext["type"]; label: string }[] = [
  { k: "personal", label: "個人" }, { k: "business", label: "自社・事業" }, { k: "project", label: "プロジェクト" },
];

export default function ContextEditor({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [c, setC] = useState<MyContext>(() => loadContext());
  const set = (k: keyof MyContext, v: string) => setC((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1"><h2 className="font-display text-lg">自分・自社の情報</h2><button onClick={onClose} className="text-muted">✕</button></div>
        <p className="text-xs text-muted mb-3">ここに入れた情報は<b>この端末だけ</b>に保存され、「自分に当てはめる」回答にだけ使われます。全部埋めなくてOK。</p>
        <div className="flex gap-1 mb-3">{TYPES.map((t) => <button key={t.k} onClick={() => set("type", t.k)} className={`text-sm rounded-full px-3 py-1 ${c.type === t.k ? "bg-fg text-bg" : "border border-line text-muted"}`}>{t.label}</button>)}</div>
        <div className="space-y-2.5">
          {(Object.keys(CONTEXT_FIELDS) as (keyof typeof CONTEXT_FIELDS)[]).map((k) => (
            <label key={k} className="block text-sm">
              <span className="text-muted text-xs">{CONTEXT_FIELDS[k]}</span>
              {(k === "business" || k === "challenge" || k === "initiatives") ? (
                <textarea value={c[k]} onChange={(e) => set(k, e.target.value)} rows={2} className="mt-0.5 w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
              ) : (
                <input value={c[k]} onChange={(e) => set(k, e.target.value)} className="mt-0.5 w-full rounded border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => { saveContext(c); onSaved?.(); onClose(); }} className="rounded-full bg-accent text-white px-5 py-2 text-sm">保存</button>
          <button onClick={() => setC(emptyContext())} className="rounded-full border border-line px-4 py-2 text-sm text-muted">全消去</button>
        </div>
      </div>
    </div>
  );
}
