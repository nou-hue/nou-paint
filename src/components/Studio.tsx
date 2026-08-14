import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  Grid2x2,
  Menu,
  Minus,
  Pencil,
  Plus,
  Settings,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FinishScreen } from "@/components/FinishScreen";
import { GridPainter, type GridHandle } from "@/components/GridPainter";
import { pageById } from "@/lib/paint/catalog";
import {
  drawContained,
  floodFill,
  floodSimilar,
  loadImage,
} from "@/lib/paint/engine";
import { useAppStore } from "@/lib/paint/store";
import { cn } from "@/lib/utils";

type Props = {
  pageId: string;
  uploadSrc?: string | null;
};

export function Studio({ pageId, uploadSrc }: Props) {
  const page = pageById(pageId);
  const title = page?.title ?? (pageId === "upload" ? "Your image" : "Studio");
  const src = uploadSrc ?? page?.source ?? "/pages/sample-garden.jpg";
  const age = useAppStore((s) => s.age) ?? "adult";
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);
  const unlocked = useAppStore((s) => s.adultUnlocked);
  const unlock = useAppStore((s) => s.unlockAdult);

  const [palette, setPalette] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [payOpen, setPayOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [preview, setPreview] = useState("/pages/sample-done.jpg");
  const [strict, setStrict] = useState(age === "adult");
  const gridRef = useRef<GridHandle>(null);
  const lineRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const walls = useRef<ImageData | null>(null);
  const history = useRef<ImageData[]>([]);

  const onPalette = useCallback((hexes: string[]) => {
    setPalette(hexes);
    setSelected(0);
  }, []);

  useEffect(() => {
    if (style !== "freeform") return;
    let gone = false;
    const line = lineRef.current;
    const paint = paintRef.current;
    if (!line || !paint) return;
    const box = line.parentElement;
    if (!box) return;
    const size = Math.min(Math.floor(box.clientWidth), 900);
    line.width = paint.width = size;
    line.height = paint.height = size;
    loadImage(src).then((img) => {
      if (gone) return;
      const lctx = line.getContext("2d");
      const pctx = paint.getContext("2d");
      if (!lctx || !pctx) return;
      drawContained(lctx, img, size, size, img.naturalWidth, img.naturalHeight);
      walls.current = lctx.getImageData(0, 0, size, size);
      pctx.clearRect(0, 0, size, size);
    }).catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [src, style]);

  function capture() {
    if (style === "mosaic") return gridRef.current?.exportPng() ?? "/pages/sample-done.jpg";
    const line = lineRef.current;
    const paint = paintRef.current;
    if (!line || !paint) return "/pages/sample-done.jpg";
    const out = document.createElement("canvas");
    out.width = line.width;
    out.height = line.height;
    const ctx = out.getContext("2d");
    if (!ctx) return "/pages/sample-done.jpg";
    ctx.drawImage(line, 0, 0);
    ctx.drawImage(paint, 0, 0);
    return out.toDataURL("image/png");
  }

  function download() {
    if (age === "adult" && !unlocked) {
      setPayOpen(true);
      return;
    }
    const a = document.createElement("a");
    a.href = capture();
    a.download = "nou-paint.png";
    a.click();
  }

  function paintAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    if (!paint || !ctx) return;
    history.current.push(ctx.getImageData(0, 0, paint.width, paint.height));
    if (history.current.length > 24) history.current.shift();
    const r = paint.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * paint.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * paint.height);
    const img = ctx.getImageData(0, 0, paint.width, paint.height);
    const hex = palette[selected] ?? "#d4a39a";
    if (walls.current) {
      const n = floodFill(img, walls.current, x, y, hex, "fill");
      if (n < 12) floodSimilar(img, x, y, hex, 36);
    }
    ctx.putImageData(img, 0, 0);
  }

  if (finished) {
    return (
      <FinishScreen
        preview={preview}
        title={title}
        onClose={() => setFinished(false)}
        onDownload={download}
      />
    );
  }

  const swatches = palette.length ? palette : ["#d4a39a", "#8aa090", "#6e8b82", "#c9bdd4", "#f6f1e6"];

  return (
    <div className="damask flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-gold-deep">
          <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
            <path d="M14 3c0 6-3 10-7 11 4 1 7 5 7 11 0-6 3-10 7-11-4-1-7-5-7-11z" fill="currentColor" />
          </svg>
          <span className="hidden font-display text-xl sm:inline">Nou Paint</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-display text-lg">{title}</p>
          <p className="text-xs text-muted">
            {style === "mosaic" ? "Square grid" : "Freeform"} · {age === "child" ? "Free" : "Adult"}
          </p>
        </div>
        <div className="flex text-muted">
          <button type="button" className="grid size-10 place-items-center" aria-label="Save">
            <Bookmark className="size-4" />
          </button>
          <button type="button" className="grid size-10 place-items-center" aria-label="Settings">
            <Settings className="size-4" />
          </button>
          <Link to="/" className="grid size-10 place-items-center" aria-label="Menu">
            <Menu className="size-4" />
          </Link>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-4xl flex-1 px-4 pb-3">
        <div className="relative overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-border)]">
          <div className="relative aspect-square w-full">
            {style === "mosaic" ? (
              <GridPainter
                ref={gridRef}
                pageId={pageId}
                src={src}
                cols={page?.grid ?? (age === "child" ? 22 : 32)}
                colors={page?.colors ?? (age === "child" ? 8 : 14)}
                selected={selected}
                strict={strict}
                zoom={zoom}
                onProgress={setProgress}
                onPalette={onPalette}
              />
            ) : (
              <>
                <canvas ref={lineRef} className="absolute inset-0 h-full w-full" />
                <canvas
                  ref={paintRef}
                  className="absolute inset-0 h-full w-full touch-none"
                  onPointerDown={paintAt}
                />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setPreview(capture());
              setFinished(true);
            }}
            className="absolute left-4 top-4 grid size-16 place-items-center rounded-full bg-surface/90 shadow-[var(--shadow-border)]"
            aria-label="Finish artwork"
          >
            <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="#e4d9c6" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="#b08a45"
                strokeWidth="3"
                strokeDasharray={`${(progress / 100) * 88} 88`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[10px] font-medium tabular-nums text-gold-deep">{progress}%</span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[28px] bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs tracking-wide text-muted uppercase">Colors</p>
            {swatches.map((hex, i) => (
              <button
                key={`${hex}-${i}`}
                type="button"
                title={`Color ${i + 1}`}
                onClick={() => setSelected(i)}
                className={cn(
                  "relative size-9 rounded-full shadow-[var(--shadow-border)]",
                  selected === i && "ring-2 ring-gold ring-offset-2 ring-offset-surface",
                )}
                style={{ background: hex }}
              >
                <span className="absolute inset-0 grid place-items-center text-[10px] font-medium text-ink/55">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (style === "mosaic" ? gridRef.current?.undo() : undefined)}
              className="grid size-11 place-items-center text-ink"
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </button>
            <div className="flex items-center gap-1 text-sm tabular-nums text-muted">
              <button type="button" className="grid size-9 place-items-center" onClick={() => setZoom((z) => Math.max(80, z - 10))}>
                <Minus className="size-3.5" />
              </button>
              {zoom}%
              <button type="button" className="grid size-9 place-items-center" onClick={() => setZoom((z) => Math.min(160, z + 10))}>
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="flex rounded-xl bg-ink/5 p-1">
              <button
                type="button"
                onClick={() => setStyle("freeform")}
                className={cn(
                  "inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm",
                  style === "freeform" ? "bg-paper text-ink shadow-[var(--shadow-border)]" : "text-muted",
                )}
              >
                <Pencil className="size-3.5" />
                Freeform
              </button>
              <button
                type="button"
                onClick={() => setStyle("mosaic")}
                className={cn(
                  "inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm",
                  style === "mosaic" ? "bg-paper text-ink shadow-[var(--shadow-border)]" : "text-muted",
                )}
              >
                <Grid2x2 className="size-3.5" />
                Square
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStrict((v) => !v)}
              className={cn(
                "h-10 rounded-lg px-3 text-sm",
                strict ? "bg-gold/15 text-gold-deep" : "text-muted",
              )}
            >
              {strict ? "Match numbers" : "Any colour"}
            </button>
            <div className="flex-1" />
            <span className="text-sm tabular-nums text-gold-deep">{progress}%</span>
          </div>
        </div>
      </div>

      {payOpen && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/30 px-6">
          <div className="w-full max-w-sm rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)]">
            <h2 className="font-display text-2xl">Keep this page</h2>
            <p className="mt-2 text-sm text-muted">Adults download for £1.99. Children keep theirs free.</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="h-11 flex-1 rounded-md bg-gold text-accent-fg"
                onClick={() => {
                  unlock();
                  setPayOpen(false);
                  setTimeout(download, 40);
                }}
              >
                Pay £1.99
              </button>
              <button type="button" className="h-11 px-3 text-sm text-muted" onClick={() => setPayOpen(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
