import { rgbToHex } from "./palette";

export type GridDoc = {
  cols: number;
  rows: number;
  palette: string[];
  cells: number[];
  filled: boolean[];
};

type RGB = [number, number, number];

export function buildGrid(
  img: HTMLImageElement,
  cols: number,
  colorCount: number,
): GridDoc {
  const rows = cols;
  const src = document.createElement("canvas");
  src.width = cols;
  src.height = rows;
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(0, 0, cols, rows);
  const scale = Math.min(cols / img.naturalWidth, rows / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const samples: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }

  const centroids = medianCut(samples, Math.max(4, Math.min(colorCount, 18)));
  const cells: number[] = new Array(cols * rows);
  for (let p = 0; p < samples.length; p++) {
    cells[p] = nearest(samples[p], centroids);
  }

  return {
    cols,
    rows,
    palette: centroids.map(([r, g, b]) => rgbToHex(r, g, b)),
    cells,
    filled: new Array(cols * rows).fill(false),
  };
}

export function fillMatching(
  doc: GridDoc,
  index: number,
  selected: number,
  strict: boolean,
): number | null {
  if (index < 0 || index >= doc.cells.length) return null;
  if (doc.filled[index]) return null;
  if (strict && doc.cells[index] !== selected) return null;
  doc.filled[index] = true;
  return index;
}

export function progressOf(doc: GridDoc) {
  const total = doc.filled.length;
  const done = doc.filled.reduce((n, v) => n + (v ? 1 : 0), 0);
  return total ? Math.round((done / total) * 100) : 0;
}

function medianCut(pixels: RGB[], k: number): RGB[] {
  type Box = { pts: RGB[]; };
  const boxes: Box[] = [{ pts: pixels.slice() }];
  while (boxes.length < k) {
    let bi = 0;
    let best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const r = rangeOf(boxes[i].pts);
      if (r.span > best) {
        best = r.span;
        bi = i;
      }
    }
    const box = boxes[bi];
    if (box.pts.length < 2) break;
    const { ch } = rangeOf(box.pts);
    box.pts.sort((a, b) => a[ch] - b[ch]);
    const mid = Math.floor(box.pts.length / 2);
    const left = box.pts.slice(0, mid);
    const right = box.pts.slice(mid);
    boxes.splice(bi, 1, { pts: left }, { pts: right });
  }
  return boxes.map((b) => average(b.pts));
}

function rangeOf(pts: RGB[]) {
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
  for (const [r, g, b] of pts) {
    if (r < minR) minR = r;
    if (g < minG) minG = g;
    if (b < minB) minB = b;
    if (r > maxR) maxR = r;
    if (g > maxG) maxG = g;
    if (b > maxB) maxB = b;
  }
  const spans: RGB = [maxR - minR, maxG - minG, maxB - minB];
  let ch = 0;
  if (spans[1] > spans[0]) ch = 1;
  if (spans[2] > spans[ch]) ch = 2;
  return { ch, span: spans[ch] };
}

function average(pts: RGB[]): RGB {
  let r = 0, g = 0, b = 0;
  for (const p of pts) {
    r += p[0];
    g += p[1];
    b += p[2];
  }
  const n = pts.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function nearest(p: RGB, cents: RGB[]) {
  let best = 0;
  let d0 = Infinity;
  for (let i = 0; i < cents.length; i++) {
    const d = dist2(p, cents[i]);
    if (d < d0) {
      d0 = d;
      best = i;
    }
  }
  return best;
}

function dist2(a: RGB, b: RGB) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
