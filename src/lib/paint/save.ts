import type { GridDoc } from "./grid";

const key = (pageId: string, style: string) => `nou-paint:${pageId}:${style}`;

export function loadFilled(pageId: string, style: string): boolean[] | null {
  try {
    const raw = localStorage.getItem(key(pageId, style));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { filled?: boolean[] };
    return parsed.filled ?? null;
  } catch {
    return null;
  }
}

export function saveFilled(pageId: string, style: string, doc: GridDoc) {
  try {
    localStorage.setItem(key(pageId, style), JSON.stringify({ filled: doc.filled }));
  } catch {
    /* quota */
  }
}
