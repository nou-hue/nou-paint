/**
 * Region painter data model: pure functions, no DOM, no React.
 *
 * A page is a list of regions in an 800 x 800 viewBox:
 *   { id, n, d, cx, cy }
 *   id  unique slug            n   colour number (1-based palette index)
 *   d   SVG path data          cx, cy  where the number label sits
 * Later regions sit on top of earlier ones (no holes). The SVG a premium page
 * is delivered as is DATA: we read its <path> elements and render our own
 * markup, so nothing inside a delivered file is ever injected into the page.
 */

export type Region = { id: string; n: number; d: string; cx: number; cy: number };

export const REGION_VIEWBOX_SIZE = 800;
export const REGION_VIEWBOX = "0 0 800 800";

const MAX_BYTES = 512 * 1024;
const MAX_REGIONS = 400;
const MAX_D = 8000;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const D_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;

export type ParseResult = { ok: true; regions: Region[] } | { ok: false; error: string };

const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

/**
 * Reads region data out of a delivered SVG. Strict on purpose: anything odd
 * (wrong viewBox, scripts, handlers, bad ids/paths, duplicate ids) is refused,
 * not repaired.
 */
export function parseRegionSvg(text: string): ParseResult {
  if (typeof text !== "string" || text.length === 0) return { ok: false, error: "empty" };
  if (text.length > MAX_BYTES) return { ok: false, error: "too_large" };
  if (/<script|<foreignObject|<iframe|<!ENTITY|javascript:|\son[a-z]+\s*=/i.test(text)) {
    return { ok: false, error: "unsafe_content" };
  }
  const root = text.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return { ok: false, error: "no_svg" };
  const vb = attrs(root).viewBox?.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0 || vb[2] !== 800 || vb[3] !== 800) {
    return { ok: false, error: "bad_viewbox" };
  }

  const regions: Region[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/<path\b([^>]*?)\/?>/gi)) {
    const a = attrs(m[1]);
    const id = a.id;
    const n = num(a["data-n"]);
    const d = a.d;
    if (!id || !ID_RE.test(id)) return { ok: false, error: "bad_id" };
    if (seen.has(id)) return { ok: false, error: "duplicate_id" };
    if (n === null || !Number.isInteger(n) || n < 1 || n > 99) return { ok: false, error: "bad_number" };
    if (!d || d.length > MAX_D || !D_RE.test(d)) return { ok: false, error: "bad_path" };
    seen.add(id);
    let cx = num(a["data-cx"]);
    let cy = num(a["data-cy"]);
    if (cx === null || cy === null || cx < 0 || cx > 800 || cy < 0 || cy > 800) {
      const p = labelAnchor(d);
      cx = p.x;
      cy = p.y;
    }
    regions.push({ id, n, d, cx, cy });
    if (regions.length > MAX_REGIONS) return { ok: false, error: "too_many_regions" };
  }
  if (regions.length === 0) return { ok: false, error: "no_regions" };
  return { ok: true, regions };
}

/* ------------------------------------------------------------------ geometry */

export type Pt = { x: number; y: number };

const NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function arcPoints(p0: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, p1: Pt): Pt[] {
  if (rx === 0 || ry === 0 || (p0.x === p1.x && p0.y === p1.y)) return [p1];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const sign = large === sweep ? -1 : 1;
  const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = sign * Math.sqrt(Math.max(0, num2 / den));
  const cxp = (k * rx * y1) / ry;
  const cyp = (-k * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
  const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dth) / (Math.PI / 12)));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = th1 + (dth * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  out[out.length - 1] = p1;
  return out;
}

/** Flattens path data into polylines (one per subpath). Curves and arcs are sampled. */
export function flattenPath(d: string): Pt[][] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: Pt[][] = [];
  let cur: Pt[] = [];
  let pos: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtl: Pt | null = null;
  let cmd = "";
  let i = 0;
  const isCmd = (t: string) => /^[A-Za-z]$/.test(t);
  const take = (n: number): number[] | null => {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i + k];
      if (t === undefined || isCmd(t)) return null;
      out.push(Number(t));
    }
    i += n;
    return out;
  };
  const push = (p: Pt) => {
    cur.push(p);
    pos = p;
  };
  const cubic = (p0: Pt, c1: Pt, c2: Pt, p1: Pt) => {
    for (let s = 1; s <= 12; s++) {
      const t = s / 12;
      const u = 1 - t;
      cur.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
      });
    }
    pos = p1;
  };
  const quad = (p0: Pt, c: Pt, p1: Pt) => {
    for (let s = 1; s <= 10; s++) {
      const t = s / 10;
      const u = 1 - t;
      cur.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y });
    }
    pos = p1;
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    else if (cmd === "") break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? pos.x : 0;
    const oy = rel ? pos.y : 0;
    if (C === "Z") {
      if (cur.length) subs.push(cur);
      cur = [];
      pos = start;
      lastCtl = null;
      continue;
    }
    if (C === "M") {
      const v = take(2);
      if (!v) break;
      if (cur.length) subs.push(cur);
      cur = [];
      start = { x: ox + v[0], y: oy + v[1] };
      push(start);
      cmd = rel ? "l" : "L"; // extra pairs are implicit lineto
      lastCtl = null;
    } else if (C === "L") {
      const v = take(2);
      if (!v) break;
      push({ x: ox + v[0], y: oy + v[1] });
      lastCtl = null;
    } else if (C === "H") {
      const v = take(1);
      if (!v) break;
      push({ x: ox + v[0], y: pos.y });
      lastCtl = null;
    } else if (C === "V") {
      const v = take(1);
      if (!v) break;
      push({ x: pos.x, y: oy + v[0] });
      lastCtl = null;
    } else if (C === "C") {
      const v = take(6);
      if (!v) break;
      const p0 = pos;
      const c2 = { x: ox + v[2], y: oy + v[3] };
      cubic(p0, { x: ox + v[0], y: oy + v[1] }, c2, { x: ox + v[4], y: oy + v[5] });
      lastCtl = c2;
    } else if (C === "S") {
      const v = take(4);
      if (!v) break;
      const p0 = pos;
      const c1 = lastCtl ? { x: 2 * p0.x - lastCtl.x, y: 2 * p0.y - lastCtl.y } : p0;
      const c2 = { x: ox + v[0], y: oy + v[1] };
      cubic(p0, c1, c2, { x: ox + v[2], y: oy + v[3] });
      lastCtl = c2;
    } else if (C === "Q") {
      const v = take(4);
      if (!v) break;
      const c: Pt = { x: ox + v[0], y: oy + v[1] };
      quad(pos, c, { x: ox + v[2], y: oy + v[3] });
      lastCtl = c;
    } else if (C === "T") {
      const v = take(2);
      if (!v) break;
      const c: Pt = lastCtl ? { x: 2 * pos.x - lastCtl.x, y: 2 * pos.y - lastCtl.y } : pos;
      quad(pos, c, { x: ox + v[0], y: oy + v[1] });
      lastCtl = c;
    } else if (C === "A") {
      const v = take(7);
      if (!v) break;
      const p0 = pos;
      for (const p of arcPoints(p0, v[0], v[1], v[2], v[3] !== 0, v[4] !== 0, { x: ox + v[5], y: oy + v[6] })) cur.push(p);
      pos = cur[cur.length - 1];
      lastCtl = null;
    } else break;
  }
  if (cur.length) subs.push(cur);
  return subs;
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number };

export function pathBox(d: string): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of flattenPath(d)) {
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function edgeDist(poly: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
    const dx = x - (a.x + t * vx);
    const dy = y - (a.y + t * vy);
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  return best;
}

/**
 * Where a number label should sit: the point inside the shape that is furthest
 * from its edge (works for concave shapes and thin strips). Rounded to 0.1.
 */
export function labelAnchor(d: string): Pt {
  const subs = flattenPath(d).filter((s) => s.length >= 3);
  const box = pathBox(d);
  const fallback = { x: round1(box.minX + box.w / 2), y: round1(box.minY + box.h / 2) };
  if (!subs.length || box.w === 0 || box.h === 0) return fallback;
  const poly = subs.reduce((a, b) => (area(b) > area(a) ? b : a));
  let best: Pt | null = null;
  let bestD = -1;
  let step = Math.max(box.w, box.h) / 24;
  let x0 = box.minX;
  let x1 = box.maxX;
  let y0 = box.minY;
  let y1 = box.maxY;
  for (let pass = 0; pass < 3; pass++) {
    for (let x = x0; x <= x1; x += step) {
      for (let y = y0; y <= y1; y += step) {
        if (!inside(poly, x, y)) continue;
        const dd = edgeDist(poly, x, y);
        if (dd > bestD) {
          bestD = dd;
          best = { x, y };
        }
      }
    }
    if (!best) return fallback;
    x0 = best.x - step;
    x1 = best.x + step;
    y0 = best.y - step;
    y1 = best.y + step;
    step /= 6;
  }
  return best ? { x: round1(best.x), y: round1(best.y) } : fallback;
}

function area(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return Math.abs(a / 2);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------- painting state */

/** region id -> colour number (1-based palette index). Absent = not painted. */
export type Fills = Readonly<Record<string, number>>;

export type PaintHistory = { past: Fills[]; present: Fills; future: Fills[] };

export const MAX_UNDO = 100;

export const emptyHistory = (): PaintHistory => ({ past: [], present: {}, future: [] });

export type PaintOutcome = "painted" | "erased" | "wrong-number" | "unchanged";

/** Paint `region` with colour number `colour`. In strict mode only the region's own number is accepted. */
export function paintRegion(
  h: PaintHistory,
  region: Region,
  colour: number,
  strict: boolean,
): { history: PaintHistory; outcome: PaintOutcome } {
  if (strict && colour !== region.n) return { history: h, outcome: "wrong-number" };
  if (h.present[region.id] === colour) return { history: h, outcome: "unchanged" };
  return {
    history: {
      past: [...h.past, h.present].slice(-MAX_UNDO),
      present: { ...h.present, [region.id]: colour },
      future: [],
    },
    outcome: "painted",
  };
}

export function eraseRegion(h: PaintHistory, region: Region): { history: PaintHistory; outcome: PaintOutcome } {
  if (h.present[region.id] === undefined) return { history: h, outcome: "unchanged" };
  const rest = { ...h.present };
  delete rest[region.id];
  return { history: { past: [...h.past, h.present].slice(-MAX_UNDO), present: rest, future: [] }, outcome: "erased" };
}

export function undoPaint(h: PaintHistory): PaintHistory {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redoPaint(h: PaintHistory): PaintHistory {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

/** Whole-number percent of regions painted. */
export function regionProgress(regions: readonly Region[], fills: Fills): number {
  if (regions.length === 0) return 0;
  const done = regions.filter((r) => fills[r.id] !== undefined).length;
  return Math.round((done / regions.length) * 100);
}

/** Highest colour number used by the page: how many palette colours it needs. */
export function colourCount(regions: readonly Region[]): number {
  return regions.reduce((m, r) => Math.max(m, r.n), 0);
}

/* ------------------------------------------------------------------ navigation */

export type Dir = "left" | "right" | "up" | "down";

/** Nearest region in the pressed direction (by label anchor); stays put when there is none. */
export function moveFocus(regions: readonly Region[], fromId: string | null, dir: Dir): string | null {
  const from = regions.find((r) => r.id === fromId) ?? regions[0];
  if (!from) return null;
  const ux = dir === "right" ? 1 : dir === "left" ? -1 : 0;
  const uy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
  const pick = (cone: number): Region | null => {
    let best: Region | null = null;
    let bestScore = Infinity;
    for (const r of regions) {
      if (r.id === from.id) continue;
      const dx = r.cx - from.cx;
      const dy = r.cy - from.cy;
      const along = dx * ux + dy * uy;
      if (along <= 0.5) continue;
      const across = Math.abs(dx * uy - dy * ux);
      if (across > along * cone) continue;
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  };
  // Roughly in that direction (about 68 degrees either side); if nothing is, anything on that side.
  return (pick(2.5) ?? pick(Infinity) ?? from).id;
}

/** Previous/next region in page order, wrapping. */
export function stepRegion(regions: readonly Region[], fromId: string | null, by: 1 | -1): string | null {
  if (regions.length === 0) return null;
  const i = regions.findIndex((r) => r.id === fromId);
  const j = i < 0 ? (by === 1 ? 0 : regions.length - 1) : (i + by + regions.length) % regions.length;
  return regions[j].id;
}

/** The next unpainted region that wants colour `n`, searching on from `fromId` and wrapping. */
export function nextToPaint(regions: readonly Region[], fills: Fills, n: number, fromId: string | null): string | null {
  const start = Math.max(0, regions.findIndex((r) => r.id === fromId));
  for (let k = 1; k <= regions.length; k++) {
    const r = regions[(start + k) % regions.length];
    if (r.n === n && fills[r.id] === undefined) return r.id;
  }
  return null;
}

/* ------------------------------------------------------------------ tapping */

export const TARGET_PX = 44;

export type Metrics = Record<string, Box>;

export function regionMetrics(regions: readonly Region[]): Metrics {
  const m: Metrics = {};
  for (const r of regions) m[r.id] = pathBox(r.d);
  return m;
}

/**
 * Which region a tap means. A tap that lands on a region that is comfortably
 * tappable (at least 44 CSS px across) means that region. A tap that lands on
 * a tiny region, or near one, snaps to the nearest tiny region within 22 px,
 * so small shapes still meet the 44 px touch target. `scale` is CSS px per
 * viewBox unit.
 */
export function resolveTap(
  regions: readonly Region[],
  metrics: Metrics,
  hitId: string | null,
  at: Pt,
  scale: number,
): string | null {
  const small = (id: string) => {
    const b = metrics[id];
    return !b || Math.min(b.w, b.h) * scale < TARGET_PX;
  };
  const radius = TARGET_PX / 2 / scale;
  if (hitId && small(hitId)) return hitId;
  let best: string | null = null;
  let bestD = radius;
  for (const r of regions) {
    if (!small(r.id)) continue;
    const dd = Math.hypot(r.cx - at.x, r.cy - at.y);
    if (dd <= bestD) {
      bestD = dd;
      best = r.id;
    }
  }
  return best ?? hitId;
}

/* ------------------------------------------------------------------- export */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Label size in viewBox units: fits the region, never below 9 or above 20. */
export function labelSize(box: Box | undefined): number {
  if (!box) return 14;
  return Math.max(9, Math.min(20, Math.min(box.w, box.h) * 0.45));
}

/** A standalone SVG of the painting, built from our own data (never from delivered markup). */
export function renderPaintedSvg(
  regions: readonly Region[],
  fills: Fills,
  palette: readonly string[],
  opts: { numbers?: boolean; paper?: string } = {},
): string {
  const paper = opts.paper ?? "#f7f1e8";
  const hexOk = (h: string | undefined) => (h && /^#[0-9a-fA-F]{6}$/.test(h) ? h : paper);
  const body = regions
    .map((r) => {
      const c = fills[r.id];
      const fill = c === undefined ? paper : hexOk(palette[c - 1]);
      return `<path d="${esc(r.d)}" fill="${fill}" stroke="#2c261e" stroke-width="2.2" stroke-linejoin="round"/>`;
    })
    .join("");
  const nums = opts.numbers
    ? regions
        .filter((r) => fills[r.id] === undefined)
        .map(
          (r) =>
            `<text x="${r.cx}" y="${r.cy}" text-anchor="middle" dominant-baseline="middle" fill="#2c261e" font-size="${labelSize(pathBox(r.d))}" font-family="sans-serif">${r.n}</text>`,
        )
        .join("")
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${REGION_VIEWBOX}" width="800" height="800"><rect width="800" height="800" fill="#f3eee6"/>${body}${nums}</svg>`;
}
