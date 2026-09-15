const UA = "BookLens/0.1 (local dev; contact: booklens@example.com)";

export async function getJson<T>(url: string, timeoutMs = 15000): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getText(url: string, timeoutMs = 30000, maxBytes = 2_000_000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new TextDecoder("utf-8").decode(buf.slice(0, maxBytes));
  } catch {
    return null;
  }
}

export const isIsbn = (q: string) => /^(97[89])?\d{9}[\dXx]$/.test(q.replace(/[-\s]/g, ""));
export const normIsbn = (q: string) => q.replace(/[-\s]/g, "").toUpperCase();
