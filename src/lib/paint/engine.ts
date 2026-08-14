import { hexToRgb } from "./palette";

const INK_LUMA = 118;

export function luma(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isInk(r: number, g: number, b: number, a: number) {
  if (a < 16) return false;
  return luma(r, g, b) < INK_LUMA;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export function drawContained(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  iw: number,
  ih: number,
) {
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const x = (w - dw) / 2;
  const y = (h - dh) / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f7f1e8";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, x, y, dw, dh);
  return { x, y, dw, dh };
}

export function floodFill(
  paint: ImageData,
  walls: ImageData,
  sx: number,
  sy: number,
  hex: string,
  mode: "fill" | "wash" | "erase",
) {
  const { width: w, height: h, data: pd } = paint;
  const wd = walls.data;
  const i0 = (sy * w + sx) * 4;
  if (i0 < 0 || i0 >= pd.length) return 0;
  if (isInk(wd[i0], wd[i0 + 1], wd[i0 + 2], wd[i0 + 3])) return 0;

  const [tr, tg, tb] = mode === "erase" ? [0, 0, 0] : hexToRgb(hex);
  const ta = mode === "erase" ? 0 : 255;
  const sr = pd[i0];
  const sg = pd[i0 + 1];
  const sb = pd[i0 + 2];
  const sa = pd[i0 + 3];
  if (sr === tr && sg === tg && sb === tb && sa === ta && mode !== "wash") return 0;

  const stack = [sx, sy];
  const seen = new Uint8Array(w * h);
  let filled = 0;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (isInk(wd[i], wd[i + 1], wd[i + 2], wd[i + 3])) continue;
    if (pd[i] !== sr || pd[i + 1] !== sg || pd[i + 2] !== sb || pd[i + 3] !== sa) continue;

    if (mode === "wash") {
      const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const j = (n < 0 ? n + 1 : n) * 22 - 11;
      pd[i] = clamp(tr + j);
      pd[i + 1] = clamp(tg + j * 0.8);
      pd[i + 2] = clamp(tb + j * 0.6);
      pd[i + 3] = 230;
    } else {
      pd[i] = tr;
      pd[i + 1] = tg;
      pd[i + 2] = tb;
      pd[i + 3] = ta;
    }
    filled++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return filled;
}

export function floodSimilar(
  paint: ImageData,
  sx: number,
  sy: number,
  hex: string,
  tolerance = 36,
) {
  const { width: w, height: h, data } = paint;
  const i0 = (sy * w + sx) * 4;
  if (i0 < 0 || i0 >= data.length) return 0;
  const [tr, tg, tb] = hexToRgb(hex);
  const sr = data[i0];
  const sg = data[i0 + 1];
  const sb = data[i0 + 2];
  const sa = data[i0 + 3];
  if (sr === tr && sg === tg && sb === tb && sa === 255) return 0;

  const stack = [sx, sy];
  const seen = new Uint8Array(w * h);
  let filled = 0;
  const tol2 = tolerance * tolerance;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    if (dr * dr + dg * dg + db * db > tol2) continue;
    data[i] = tr;
    data[i + 1] = tg;
    data[i + 2] = tb;
    data[i + 3] = 255;
    filled++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return filled;
}

export function fillCell(
  paint: ImageData,
  walls: ImageData | null,
  cx: number,
  cy: number,
  cols: number,
  hex: string,
  erase = false,
) {
  const { width: w, height: h, data } = paint;
  const cellW = Math.max(4, Math.floor(w / cols));
  const cellH = cellW;
  const col = Math.floor(cx / cellW);
  const row = Math.floor(cy / cellH);
  const x0 = col * cellW;
  const y0 = row * cellH;
  const x1 = Math.min(w, x0 + cellW);
  const y1 = Math.min(h, y0 + cellH);
  const [tr, tg, tb] = hexToRgb(hex);
  const wd = walls?.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (wd && isInk(wd[i], wd[i + 1], wd[i + 2], wd[i + 3])) continue;
      if (erase) {
        data[i + 3] = 0;
      } else {
        data[i] = tr;
        data[i + 1] = tg;
        data[i + 2] = tb;
        data[i + 3] = 255;
      }
    }
  }
}

export function stampPencil(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hex: string,
  size: number,
  erase: boolean,
) {
  ctx.save();
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.fillStyle = erase ? "rgba(0,0,0,1)" : hex;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
