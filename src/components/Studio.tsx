import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  Menu,
  Minus,
  Plus,
  Redo2,
  Settings,
  Square,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FinishScreen } from "@/components/FinishScreen";
import { STUDIO_PAGES } from "@/lib/paint/catalog";
import {
  drawContained,
  fillCell,
  floodFill,
  floodSimilar,
  loadImage,
} from "@/lib/paint/engine";
import { STUDIO_PALETTE } from "@/lib/paint/palette";
import { useAppStore } from "@/lib/paint/store";
import { cn } from "@/lib/utils";

type Props = {
  pageId: string;
  uploadSrc?: string | null;
};

export function Studio({ pageId, uploadSrc }: Props) {
  const page = STUDIO_PAGES.find((p) => p.id === pageId);
  const title = page?.title ?? (pageId === "upload" ? "Your image" : "Studio");
  const src = uploadSrc ?? page?.art ?? "/pages/sample-garden.jpg";

  const age = useAppStore((s) => s.age) ?? "adult";
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);
  const color = useAppStore((s) => s.color);
  const setColor = useAppStore((s) => s.setColor);
  const mosaic = useAppStore((s) => s.mosaic);
  const unlocked = useAppStore((s) => s.adultUnlocked);
  const unlock = useAppStore((s) => s.unlockAdult);

  const lineRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const walls = useRef<ImageData | null>(null);
  const history = useRef<ImageData[]>([]);
  const [zoom, setZoom] = useState(100);
  const [progress, setProgress] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [preview, setPreview] = useState("/pages/sample-done.jpg");

  useEffect(() => {
    let gone = false;
    const line = lineRef.current;
    const paint = paintRef.current;
    if (!line || !paint) return;
    const box = line.parentElement;
    if (!box) return;
    const size = Math.min(Math.floor(box.clientWidth), 900);
    line.width = paint.width = size;
    line.height = paint.height = size;

    loadImage(src)
      .then((img) => {
        if (gone) return;
        const lctx = line.getContext("2d");
        const pctx = paint.getContext("2d");
        if (!lctx || !pctx) return;
        drawContained(lctx, img, size, size, img.naturalWidth, img.naturalHeight);
        walls.current = lctx.getImageData(0, 0, size, size);
        pctx.clearRect(0, 0, size, size);
        history.current = [];
        setProgress(0);
      })
      .catch(() => undefined);

    return () => {
      gone = true;
    };
  }, [src]);

  function snapshot() {
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    if (!paint || !ctx) return;
    history.current.push(ctx.getImageData(0, 0, paint.width, paint.height));
    if (history.current.length > 24) history.current.shift();
  }

  function undo() {
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    const prev = history.current.pop();
    if (!paint || !ctx || !prev) return;
    ctx.putImageData(prev, 0, 0);
    measure();
  }

  function measure() {
    const paint = paintRef.current;
    if (!paint) return;
    const ctx = paint.getContext("2d");
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, paint.width, paint.height).data;
    let painted = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 16) {
      total++;
      if (data[i + 3] > 20) painted++;
    }
    setProgress(total ? Math.round((painted / total) * 100) : 0);
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = paintRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * c.width),
      y: Math.floor(((e.clientY - r.top) / r.height) * c.height),
    };
  }

  function paintAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    if (!paint || !ctx) return;
    snapshot();
    const { x, y } = pos(e);
    const img = ctx.getImageData(0, 0, paint.width, paint.height);
    if (style === "mosaic") {
      fillCell(img, walls.current, x, y, mosaic, color, false);
    } else if (walls.current) {
      const n = floodFill(img, walls.current, x, y, color, "fill");
      if (n < 8) floodSimilar(img, x, y, color, 38);
    }
    ctx.putImageData(img, 0, 0);
    measure();
  }

  function capturePreview() {
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

  function openFinish() {
    setPreview(capturePreview());
    setFinished(true);
  }

  function download() {
    if (age === "adult" && !unlocked) {
      setPayOpen(true);
      return;
    }
    const href = capturePreview();
    const a = document.createElement("a");
    a.href = href;
    a.download = "nou-paint.png";
    a.click();
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

  return (
    <div className="damask flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-gold-deep">
          <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
            <path
              d="M14 3c0 6-3 10-7 11 4 1 7 5 7 11 0-6 3-10 7-11-4-1-7-5-7-11z"
              fill="currentColor"
            />
          </svg>
          <span className="hidden font-display text-xl sm:inline">Nou Paint</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-display text-lg">{title}</p>
          <p className="text-xs text-muted">
            {page?.line ?? "Custom"} · {age === "child" ? "Free" : "Adult"}
          </p>
        </div>
        <div className="flex items-center gap-1 text-muted">
          <button type="button" className="grid size-10 place-items-center" aria-label="Save">
            <Bookmark className="size-4" />
          </button>
          <button type="button" className="grid size-10 place-items-center" aria-label="Settings">
            <Settings className="size-4" />
          </button>
          <button type="button" className="grid size-10 place-items-center" aria-label="Menu">
            <Menu className="size-4" />
          </button>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-4xl flex-1 px-4 pb-3">
        <div className="relative overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-border)]">
          <div
            className="relative aspect-square w-full origin-center"
            style={{ transform: `scale(${zoom / 100})` }}
          >
            <canvas ref={lineRef} className="absolute inset-0 h-full w-full" />
            <canvas
              ref={paintRef}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={paintAt}
            />
          </div>
          <button
            type="button"
            onClick={openFinish}
            className="absolute left-4 top-4 grid size-16 place-items-center rounded-full bg-surface/90 shadow-[var(--shadow-border)]"
            aria-label="Finish"
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
            <span className="absolute text-[10px] font-medium tabular-nums text-gold-deep">
              {progress}%
            </span>
          </button>
        </div>
      </div>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 rounded-[28px] bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <button type="button" onClick={undo} className="grid size-11 place-items-center text-ink" aria-label="Undo">
            <Undo2 className="size-4" />
          </button>
          <div className="flex items-center gap-1 text-sm tabular-nums text-muted">
            <button
              type="button"
              className="grid size-9 place-items-center"
              onClick={() => setZoom((z) => Math.max(80, z - 12))}
            >
              <Minus className="size-3.5" />
            </button>
            {zoom}%
            <button
              type="button"
              className="grid size-9 place-items-center"
              onClick={() => setZoom((z) => Math.min(160, z + 12))}
            >
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
              <Redo2 className="size-3.5 rotate-90" />
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
              <Square className="size-3.5" />
              Square
            </button>
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            {STUDIO_PALETTE.slice(0, 5).map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.name}
                onClick={() => setColor(c.hex)}
                className={cn(
                  "size-9 rounded-full",
                  color === c.hex && "ring-2 ring-gold ring-offset-2 ring-offset-surface",
                )}
                style={{ background: c.hex }}
              />
            ))}
            <details className="relative">
              <summary className="grid size-9 list-none place-items-center rounded-full border border-line text-lg text-muted">
                +
              </summary>
              <div className="absolute bottom-11 left-0 z-10 flex gap-1 rounded-xl bg-surface p-2 shadow-[var(--shadow-border)]">
                {STUDIO_PALETTE.slice(5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    className="size-8 rounded-full"
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </details>
          </div>

          <button
            type="button"
            onClick={openFinish}
            className="grid size-12 place-items-center rounded-full bg-paper text-[10px] font-medium text-gold-deep shadow-[var(--shadow-border)]"
          >
            {progress}%
          </button>
        </div>
      </div>

      {payOpen && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/30 px-6">
          <div className="w-full max-w-sm rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)]">
            <h2 className="font-display text-2xl">Keep this page</h2>
            <p className="mt-2 text-sm text-muted">
              Adults download for £1.99. Children keep theirs free.
            </p>
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
