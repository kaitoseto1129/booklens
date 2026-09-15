// 開いている本の「タブ」をブラウザに保持する（ログイン不要・端末ローカル）。
export type Tab = { id: string; title: string; cover: string | null };
const KEY = "booklens.tabs";
const EVT = "booklens-tabs";

export function readTabs(): Tab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tab[]) : [];
  } catch {
    return [];
  }
}

function write(tabs: Tab[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tabs.slice(0, 12)));
  } catch {
    /* private mode 等では黙って無視 */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

/** 本を開いたらタブを追加/更新（既にあれば先頭寄りに保つ）。 */
export function upsertTab(tab: Tab) {
  const tabs = readTabs();
  const i = tabs.findIndex((t) => t.id === tab.id);
  if (i >= 0) {
    // タイトル/表紙が来たら更新
    if (tab.title && (tabs[i].title !== tab.title || tabs[i].cover !== tab.cover)) {
      tabs[i] = { ...tabs[i], ...tab };
      write(tabs);
    }
    return;
  }
  write([...tabs, tab]);
}

export function removeTab(id: string): Tab[] {
  const tabs = readTabs().filter((t) => t.id !== id);
  write(tabs);
  return tabs;
}

export function onTabsChange(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVT, h);
    window.removeEventListener("storage", h);
  };
}
