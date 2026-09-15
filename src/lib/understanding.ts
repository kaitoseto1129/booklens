// 各ポイントの理解度（端末ローカル・本ごと）
export type Level = "got" | "review" | "unclear";
type Store = Record<string, Level>; // key: pointIndex

const key = (bookId: string) => `booklens.understanding.${bookId}`;

export function loadU(bookId: string): Store {
  if (typeof window === "undefined") return {};
  try { const raw = localStorage.getItem(key(bookId)); return raw ? (JSON.parse(raw) as Store) : {}; } catch { return {}; }
}
export function setU(bookId: string, idx: number, level: Level | null): Store {
  const s = loadU(bookId);
  if (level === null) delete s[String(idx)]; else s[String(idx)] = level;
  try { localStorage.setItem(key(bookId), JSON.stringify(s)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("booklens-understanding"));
  return s;
}
export function statsU(s: Store, total: number) {
  const got = Object.values(s).filter((v) => v === "got").length;
  const review = Object.entries(s).filter(([, v]) => v === "review").map(([k]) => Number(k));
  const unclear = Object.entries(s).filter(([, v]) => v === "unclear").map(([k]) => Number(k));
  return { pct: total ? Math.round((got / total) * 100) : 0, got, review, unclear };
}
