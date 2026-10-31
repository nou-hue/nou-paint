/**
 * Pinch-zoom and pan maths for the region painter. Pure, no DOM.
 *
 * The stage is a square of side S (px). The artwork fills it at scale 1. We render it with
 * `transform: translate(x px, y px) scale(k)` and `transform-origin: 0 0`, so a stage point (px,py)
 * shows artwork point ((px - x) / k, (py - y) / k) in stage px.
 */
export type View = { k: number; x: number; y: number };
export type Pt = { x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
export const IDENTITY: View = { k: 1, x: 0, y: 0 };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep the artwork covering the stage: you can never pan it off into empty space. */
export function clampView(v: View, S: number): View {
  const k = clamp(Number.isFinite(v.k) ? v.k : 1, MIN_ZOOM, MAX_ZOOM);
  const min = S - S * k; // <= 0
  return {
    k,
    x: clamp(Number.isFinite(v.x) ? v.x : 0, min, 0),
    y: clamp(Number.isFinite(v.y) ? v.y : 0, min, 0),
  };
}

/** Zoom by `factor` keeping the stage point `at` fixed under the finger / cursor. */
export function zoomAt(v: View, factor: number, at: Pt, S: number): View {
  const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
  const r = k / v.k;
  return clampView({ k, x: at.x - (at.x - v.x) * r, y: at.y - (at.y - v.y) * r }, S);
}

export function setZoom(v: View, k: number, S: number): View {
  return zoomAt(v, k / v.k, { x: S / 2, y: S / 2 }, S);
}

export function panBy(v: View, dx: number, dy: number, S: number): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, S);
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Two fingers moved from `prev` to `cur`: scale by the spread ratio and follow the midpoint. */
export function pinch(v: View, prev: [Pt, Pt], cur: [Pt, Pt], S: number): View {
  const d0 = dist(prev[0], prev[1]);
  const d1 = dist(cur[0], cur[1]);
  if (d0 < 1) return v;
  const m0 = mid(prev[0], prev[1]);
  const m1 = mid(cur[0], cur[1]);
  const zoomed = zoomAt(v, d1 / d0, m0, S);
  return panBy(zoomed, m1.x - m0.x, m1.y - m0.y, S);
}

/** Wheel / trackpad pinch (ctrl+wheel): smooth exponential zoom. */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-clamp(px, -120, 120) * 0.0095);
}

/** Double-tap: zoom in around the tap, or back out if already zoomed. */
export function doubleTapView(v: View, at: Pt, S: number, target = 2.6): View {
  return v.k > 1.15 ? IDENTITY : zoomAt(v, target / v.k, at, S);
}

/** Stage px -> artwork units (viewBox 800). */
export function toArtwork(v: View, p: Pt, S: number, viewBox = 800): Pt {
  const f = viewBox / (S * v.k);
  return { x: (p.x - v.x) * f, y: (p.y - v.y) * f };
}

export const zoomPercent = (v: View) => Math.round(v.k * 100);

/** Has a pointer moved far enough to count as a drag rather than a tap? */
export function isDrag(from: Pt, to: Pt, slop = 7): boolean {
  return dist(from, to) > slop;
}
