"use client";
import type { VisualBlockT } from "@/lib/ai/schemas";

const Refs = ({ refs }: { refs: string[] }) => (refs?.length ? <span className="text-[11px] text-muted ml-2">({refs.join(", ")})</span> : null);

function Table({ b }: { b: VisualBlockT }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>{b.columns.map((c, i) => <th key={i} className="text-left font-semibold border-b border-line px-2 py-1.5 bg-bg">{c}</th>)}</tr>
        </thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i} className="align-top">{r.map((cell, j) => <td key={j} className="border-b border-line px-2 py-1.5">{j === 0 ? <b>{cell}</b> : cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Matrix({ b }: { b: VisualBlockT }) {
  const q = b.quadrants;
  const cell = (i: number, tone: string) => (
    <div className={`rounded-lg p-3 min-h-[92px] ${tone}`}>
      <div className="text-xs font-semibold mb-1">{q[i]?.label}</div>
      <ul className="text-xs space-y-0.5 list-disc pl-4">{(q[i]?.items ?? []).map((it, k) => <li key={k}>{it}</li>)}</ul>
    </div>
  );
  return (
    <div className="flex gap-2">
      <div className="flex items-center"><span className="text-xs text-muted [writing-mode:vertical-rl] rotate-180">{b.y_axis}</span></div>
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-2">
          {cell(0, "bg-book-soft")}{cell(1, "bg-accent-soft")}
          {cell(2, "bg-bg border border-line")}{cell(3, "bg-book-soft")}
        </div>
        <div className="text-center text-xs text-muted mt-1">{b.x_axis} →</div>
      </div>
    </div>
  );
}

function Steps({ b }: { b: VisualBlockT }) {
  return (
    <ol className="space-y-0">
      {b.steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full bg-accent text-white text-sm flex items-center justify-center shrink-0">{i + 1}</div>
            {i < b.steps.length - 1 && <div className="w-px flex-1 bg-line my-1" />}
          </div>
          <div className="pb-4">
            <div className="font-medium text-sm">{s.label}</div>
            {s.detail && <div className="text-sm text-muted">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Comparison({ b }: { b: VisualBlockT }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="w-24"></th>
            <th className="text-left font-semibold border-b border-line px-2 py-1.5 tag-book rounded-t">{b.left_title}</th>
            <th className="text-left font-semibold border-b border-line px-2 py-1.5 tag-insight rounded-t">{b.right_title}</th>
          </tr>
        </thead>
        <tbody>
          {b.comparison_rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="text-xs text-muted px-2 py-1.5 border-b border-line">{r.aspect}</td>
              <td className="px-2 py-1.5 border-b border-line">{r.left}</td>
              <td className="px-2 py-1.5 border-b border-line">{r.right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stats({ b }: { b: VisualBlockT }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {b.stats.map((s, i) => (
        <div key={i} className="rounded-lg bg-accent-soft p-3 text-center">
          <div className="text-2xl font-bold text-accent">{s.value}</div>
          <div className="text-xs text-muted mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Checklist({ b }: { b: VisualBlockT }) {
  return (
    <ul className="space-y-1.5">
      {b.checklist.map((c, i) => (
        <li key={i} className="flex gap-2 text-sm"><span className="text-accent">☐</span>{c}</li>
      ))}
    </ul>
  );
}

function Block({ b }: { b: VisualBlockT }) {
  const body =
    b.kind === "table" ? <Table b={b} /> :
    b.kind === "matrix2x2" ? <Matrix b={b} /> :
    b.kind === "steps" ? <Steps b={b} /> :
    b.kind === "comparison" ? <Comparison b={b} /> :
    b.kind === "stats" ? <Stats b={b} /> :
    b.kind === "checklist" ? <Checklist b={b} /> : null;
  if (!body) return null;
  return (
    <figure className="card p-4">
      <figcaption className="font-medium mb-2 flex items-baseline">{b.title}<Refs refs={b.evidence} /></figcaption>
      {body}
      {b.caption && <p className="text-sm text-muted mt-2">{b.caption}</p>}
    </figure>
  );
}

/** 有効なブロックだけ描画（空フィールドのkind不一致を弾く） */
function valid(b: VisualBlockT): boolean {
  switch (b.kind) {
    case "table": return b.columns.length > 0 && b.rows.length > 0;
    case "matrix2x2": return b.quadrants.length === 4;
    case "steps": return b.steps.length > 0;
    case "comparison": return b.comparison_rows.length > 0;
    case "stats": return b.stats.length > 0;
    case "checklist": return b.checklist.length > 0;
    default: return false;
  }
}

export default function Visuals({ visuals }: { visuals: VisualBlockT[] }) {
  const blocks = visuals.filter(valid);
  if (blocks.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
}
