/** Geometry for the radial fill reveal. Pure. */
export type Box = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

/** Smallest circle radius, centred on `from`, that fully covers `box` (distance to the farthest corner). */
export function revealRadius(from: Pt, box: Box): number {
  const xs = [box.x, box.x + box.w];
  const ys = [box.y, box.y + box.h];
  let r = 0;
  for (const x of xs) for (const y of ys) r = Math.max(r, Math.hypot(x - from.x, y - from.y));
  return Math.ceil(r) + 1;
}

/** Duration scales gently with the distance travelled, so big regions bloom and small ones snap. */
export function revealMs(radius: number, viewBox = 800): number {
  const t = Math.min(1, radius / (viewBox * 0.5));
  return Math.round(260 + 340 * t);
}
