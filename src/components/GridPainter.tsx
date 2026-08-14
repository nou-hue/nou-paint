import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { loadImage } from "@/lib/paint/engine";
import { buildGrid, progressOf, type GridDoc } from "@/lib/paint/grid";
import { loadFilled, saveFilled } from "@/lib/paint/save";

export type GridHandle = {
  undo: () => void;
  redo: () => void;
  exportPng: () => string | null;
};

type Props = {
  pageId: string;
  src: string;
  cols: number;
  colors: number;
  selected: number;
  strict: boolean;
  zoom: number;
  onProgress: (n: number) => void;
  onPalette: (hexes: string[]) => void;
};

export const GridPainter = forwardRef<GridHandle, Props>(function GridPainter(
  { pageId, src, cols, colors, selected, strict, zoom, onProgress, onPalette },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<GridDoc | null>(null);
  const stroke = useRef<number[]>([]);
  const history = useRef<number[][]>([]);
  const redoStack = useRef<number[][]>([]);
  const painting = useRef(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const doc = docRef.current;
    if (!canvas || !doc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const cell = size / doc.cols;
    ctx.fillStyle = "#f6f1e6";
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < doc.cells.length; i++) {
      const c = i % doc.cols;
      const r = Math.floor(i / doc.cols);
      const x = c * cell;
      const y = r * cell;
      const idx = doc.cells[i];
      const hex = doc.palette[idx] ?? "#f6f1e6";
      if (doc.filled[i]) {
        ctx.fillStyle = hex;
        ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
      } else {
        ctx.fillStyle = idx === selected ? "rgba(176,138,69,0.12)" : "#f8f3ea";
        ctx.fillRect(x, y, cell + 0.6, cell + 0.6);
        ctx.strokeStyle = "rgba(58,50,40,0.07)";
        ctx.strokeRect(x + 0.4, y + 0.4, cell - 0.8, cell - 0.8);
        if (cell >= 11) {
          ctx.fillStyle = idx === selected ? "rgba(140,106,47,0.75)" : "rgba(58,50,40,0.38)";
          ctx.font = `600 ${Math.max(8, Math.floor(cell * 0.4))}px Figtree, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(idx + 1), x + cell / 2, y + cell / 2 + 0.4);
        }
      }
    }
  }, [selected]);

  useEffect(() => {
    let gone = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const css = Math.min(parent.clientWidth, 920);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(css * dpr);
    canvas.height = Math.floor(css * dpr);

    loadImage(src)
      .then((img) => {
        if (gone) return;
        const doc = buildGrid(img, cols, colors);
        const saved = loadFilled(pageId, "mosaic");
        if (saved && saved.length === doc.filled.length) doc.filled = saved;
        docRef.current = doc;
        onPalette(doc.palette);
        onProgress(progressOf(doc));
        paint();
      })
      .catch(() => undefined);

    return () => {
      gone = true;
    };
    // paint is invoked after load; do not rebuild the grid when the brush changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, cols, colors, pageId]);

  useEffect(() => {
    paint();
  }, [paint]);

  function cellAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const doc = docRef.current;
    if (!canvas || !doc) return -1;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * doc.cols;
    const y = ((e.clientY - r.top) / r.height) * doc.rows;
    const c = Math.floor(x);
    const row = Math.floor(y);
    if (c < 0 || row < 0 || c >= doc.cols || row >= doc.rows) return -1;
    return row * doc.cols + c;
  }

  function apply(i: number) {
    const doc = docRef.current;
    if (!doc || doc.filled[i]) return;
    if (strict && doc.cells[i] !== selected) return;
    if (!strict) doc.cells[i] = selected;
    doc.filled[i] = true;
    stroke.current.push(i);
  }

  function endStroke() {
    painting.current = false;
    if (!stroke.current.length || !docRef.current) return;
    history.current.push(stroke.current.slice());
    if (history.current.length > 50) history.current.shift();
    redoStack.current = [];
    stroke.current = [];
    saveFilled(pageId, "mosaic", docRef.current);
    onProgress(progressOf(docRef.current));
    paint();
  }

  useImperativeHandle(ref, () => ({
    undo() {
      const last = history.current.pop();
      const doc = docRef.current;
      if (!last || !doc) return;
      for (const i of last) doc.filled[i] = false;
      redoStack.current.push(last);
      saveFilled(pageId, "mosaic", doc);
      onProgress(progressOf(doc));
      paint();
    },
    redo() {
      const next = redoStack.current.pop();
      const doc = docRef.current;
      if (!next || !doc) return;
      for (const i of next) doc.filled[i] = true;
      history.current.push(next);
      saveFilled(pageId, "mosaic", doc);
      onProgress(progressOf(doc));
      paint();
    },
    exportPng() {
      return canvasRef.current?.toDataURL("image/png") ?? null;
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none"
      style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}
      onPointerDown={(e) => {
        painting.current = true;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        const i = cellAt(e);
        if (i >= 0) apply(i);
        paint();
      }}
      onPointerMove={(e) => {
        if (!painting.current) return;
        const i = cellAt(e);
        if (i >= 0) apply(i);
        paint();
      }}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
    />
  );
});
