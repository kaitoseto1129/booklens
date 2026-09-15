// ユーザーの「自分・自社」情報（端末ローカルに保存し、AIの当てはめ回答に使う）
export type MyContext = {
  type: "personal" | "business" | "project";
  name: string;         // 名前 / 会社名
  business: string;     // 事業・サービス概要
  customers: string;    // 顧客
  challenge: string;    // 現在の課題
  kpi: string;          // 売上・KPI
  marketing: string;    // マーケティング
  team: string;         // チーム
  competitors: string;  // 競合
  goal: string;         // 目標
  initiatives: string;  // 進行中の施策
};

const KEY = "booklens.mycontext";
export const emptyContext = (): MyContext => ({ type: "business", name: "", business: "", customers: "", challenge: "", kpi: "", marketing: "", team: "", competitors: "", goal: "", initiatives: "" });

export function loadContext(): MyContext {
  if (typeof window === "undefined") return emptyContext();
  try { const raw = localStorage.getItem(KEY); return raw ? { ...emptyContext(), ...JSON.parse(raw) } : emptyContext(); } catch { return emptyContext(); }
}
export function saveContext(c: MyContext) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode 等 */ }
}
export function hasContext(c: MyContext): boolean {
  return Boolean(c.name || c.business || c.challenge || c.goal || c.customers);
}
const LABEL: Record<keyof Omit<MyContext, "type">, string> = {
  name: "名前・会社名", business: "事業・サービス", customers: "顧客", challenge: "現在の課題", kpi: "売上・KPI", marketing: "マーケティング", team: "チーム", competitors: "競合", goal: "目標", initiatives: "進行中の施策",
};
export function contextToText(c: MyContext): string {
  const typeLabel = { personal: "個人", business: "自社・事業", project: "プロジェクト" }[c.type];
  const lines = [`対象：${typeLabel}`];
  (Object.keys(LABEL) as (keyof typeof LABEL)[]).forEach((k) => { if (c[k]?.trim()) lines.push(`${LABEL[k]}：${c[k].trim()}`); });
  return lines.join("\n");
}
export const CONTEXT_FIELDS = LABEL;
