import { Link } from "@tanstack/react-router";
import { Download, Grid2x2, Home, Lock, Minus, Pencil, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FinishScreen } from "@/components/FinishScreen";
import { GridPainter, type GridHandle } from "@/components/GridPainter";
import { RegionPainter, type RegionPainterHandle } from "@/components/RegionPainter";
import { UnlockDialog } from "@/components/UnlockDialog";
import { pageById, type StudioPage } from "@/lib/paint/catalog";
import { REGION_PALETTE } from "@/lib/paint/palette";
import { colourCount, parseRegionSvg, type Region } from "@/lib/paint/regions";
import { drawContained, floodFill, floodSimilar, labelColorFor, loadImage, paintedPercent } from "@/lib/paint/engine";
import { fetchEntitlement } from "@/lib/pay/client";
import { useAppStore } from "@/lib/paint/store";
import { cn } from "@/lib/utils";

type Props = {
  pageId: string;
  uploadSrc?: string | null;
};

type Access = "checking" | "locked" | "open";

/**
 * Free pages and uploads open straight away. A premium page asks the SERVER
 * (/api/entitlement) first; the image itself is only served by /api/page/:id
 * to an entitled browser, so nothing in the browser can unlock it.
 */
export function Studio({ pageId, uploadSrc }: Props) {
  const page = pageById(pageId);
  const premium = page?.premium === true;
  const [access, setAccess] = useState<Access>(premium ? "checking" : "open");
  const [unlockOpen, setUnlockOpen] = useState(false);

  useEffect(() => {
    if (!premium || !page?.packId) {
      setAccess("open");
      return;
    }
    let gone = false;
    setAccess("checking");
    void fetchEntitlement().then((info) => {
      if (gone) return;
      setAccess(info?.packs.includes(page.packId!) ? "open" : "locked");
    });
    return () => {
      gone = true;
    };
  }, [premium, page?.packId, pageId]);

  if (access === "open") return <StudioInner pageId={pageId} uploadSrc={uploadSrc} page={page} />;

  return (
    <main id="main" className="damask grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] bg-surface p-5 text-center shadow-[var(--shadow-border)]">
        {page?.teaser && (
          <img src={page.teaser} alt="" className="aspect-square w-full rounded-[20px] object-cover" aria-hidden />
        )}
        <h1 className="mt-4 font-display text-3xl">{page?.title}</h1>
        {access === "checking" ? (
          <p className="mt-2 text-muted">Checking…</p>
        ) : (
          <>
            <p className="mt-2 inline-flex items-center gap-2 text-muted">
              <Lock className="size-4" aria-hidden /> This page is part of a paid pack for grown-ups.
            </p>
            <button
              type="button"
              onClick={() => setUnlockOpen(true)}
              className="mt-5 h-12 w-full rounded-md bg-accent px-4 font-medium text-accent-fg"
            >
              Unlock (grown-ups)
            </button>
          </>
        )}
        <Link to="/" className="mt-3 inline-flex h-11 min-w-11 items-center px-4 text-sm text-muted underline">
          Back to free pages
        </Link>
      </div>
      {unlockOpen && <UnlockDialog pageId={pageId} onClose={() => setUnlockOpen(false)} />}
    </main>
  );
}

function StudioInner({ pageId, uploadSrc, page }: Props & { page: StudioPage | undefined }) {
  const title = page?.title ?? (pageId === "upload" ? "Your image" : "Studio");
  const src = uploadSrc ?? page?.source ?? "/pages/sample-garden.jpg";
  const age = useAppStore((s) => s.age) ?? "adult";
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);

  const [palette, setPalette] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [finished, setFinished] = useState(false);
  const [preview, setPreview] = useState("/pages/sample-done.jpg");
  const [strict, setStrict] = useState(age === "adult");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const isRegions = page?.format === "regions";
  const [regions, setRegions] = useState<readonly Region[] | null>(page?.regions ?? null);
  const gridRef = useRef<GridHandle>(null);
  const regionRef = useRef<RegionPainterHandle>(null);
  const lineRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const walls = useRef<ImageData | null>(null);
  const history = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const onPalette = useCallback((hexes: string[]) => {
    setPalette(hexes);
    setSelected(0);
  }, []);

  const onRegionHistory = useCallback((h: { canUndo: boolean; canRedo: boolean }) => {
    setCanUndo(h.canUndo);
    setCanRedo(h.canRedo);
  }, []);

  const syncFreeformHistory = () => {
    setCanUndo(history.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  };

  // Region pages: free ones carry their regions; premium ones are fetched from the entitlement-checked route.
  useEffect(() => {
    if (!isRegions || !page) return;
    if (page.regions) {
      setRegions(page.regions);
      return;
    }
    let gone = false;
    setRegions(null);
    setLoadError(false);
    fetch(page.source, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const parsed = parseRegionSvg(await r.text());
        if (!parsed.ok) throw new Error(parsed.error);
        if (!gone) setRegions(parsed.regions);
      })
      .catch(() => !gone && setLoadError(true));
    return () => {
      gone = true;
    };
  }, [isRegions, page]);

  useEffect(() => {
    if (isRegions || style !== "freeform") return;
    let gone = false;
    const line = lineRef.current;
    const paint = paintRef.current;
    if (!line || !paint) return;
    const box = line.parentElement;
    if (!box) return;
    const size = Math.min(Math.floor(box.clientWidth), 900);
    line.width = paint.width = size;
    line.height = paint.height = size;
    history.current = [];
    redoStack.current = [];
    syncFreeformHistory();
    setProgress(0);
    setLoadError(false);
    loadImage(src)
      .then((img) => {
        if (gone) return;
        const lctx = line.getContext("2d");
        const pctx = paint.getContext("2d");
        if (!lctx || !pctx) return;
        drawContained(lctx, img, size, size, img.naturalWidth, img.naturalHeight);
        walls.current = lctx.getImageData(0, 0, size, size);
        pctx.clearRect(0, 0, size, size);
      })
      .catch(() => !gone && setLoadError(true));
    return () => {
      gone = true;
    };
  }, [src, style, isRegions]);

  function capture() {
    if (isRegions) {
      const svg = regionRef.current?.exportSvg();
      return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "/pages/sample-done.jpg";
    }
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

  /** Saves the picture to the device. Entirely local: nothing is uploaded. */
  function download() {
    if (isRegions) {
      const svg = regionRef.current?.exportSvg();
      if (!svg) return;
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      const save = (href: string, name: string) => {
        const a = document.createElement("a");
        a.href = href;
        a.download = name;
        a.click();
      };
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 1600;
        c.getContext("2d")?.drawImage(img, 0, 0, 1600, 1600);
        URL.revokeObjectURL(url);
        save(c.toDataURL("image/png"), "nou-paint.png");
      };
      img.onerror = () => {
        save(url, "nou-paint.svg"); // the browser could not draw it: save the SVG itself
      };
      img.src = url;
      return;
    }
    const a = document.createElement("a");
    a.href = capture();
    a.download = "nou-paint.png";
    a.click();
  }

  function paintPoint(x: number, y: number) {
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    if (!paint || !ctx || !walls.current) return;
    const before = ctx.getImageData(0, 0, paint.width, paint.height);
    const img = ctx.getImageData(0, 0, paint.width, paint.height);
    const hex = palette[selected] ?? "#d4a39a";
    const n = floodFill(img, walls.current, x, y, hex, "fill");
    if (n < 12) floodSimilar(img, x, y, hex, 36);
    if (img.data.every((v, i) => v === before.data[i])) return; // nothing changed: not an undo step
    history.current.push(before);
    if (history.current.length > 24) history.current.shift();
    redoStack.current = [];
    ctx.putImageData(img, 0, 0);
    setProgress(paintedPercent(img, walls.current));
    syncFreeformHistory();
  }

  function paintAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const paint = paintRef.current;
    if (!paint) return;
    const r = paint.getBoundingClientRect();
    paintPoint(
      Math.floor(((e.clientX - r.left) / r.width) * paint.width),
      Math.floor(((e.clientY - r.top) / r.height) * paint.height),
    );
  }

  function freeformKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const paint = paintRef.current;
    if (!paint) return;
    const step = e.shiftKey ? 0.1 : 0.03;
    const c = cursor ?? { x: 0.5, y: 0.5 };
    const move = (dx: number, dy: number) => {
      e.preventDefault();
      setCursor({
        x: Math.min(0.98, Math.max(0.02, c.x + dx)),
        y: Math.min(0.98, Math.max(0.02, c.y + dy)),
      });
    };
    if (e.key === "ArrowLeft") move(-step, 0);
    else if (e.key === "ArrowRight") move(step, 0);
    else if (e.key === "ArrowUp") move(0, -step);
    else if (e.key === "ArrowDown") move(0, step);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      paintPoint(Math.floor(c.x * paint.width), Math.floor(c.y * paint.height));
    }
  }

  function undo() {
    if (isRegions) return regionRef.current?.undo();
    if (style === "mosaic") return gridRef.current?.undo();
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    const prev = history.current.pop();
    if (!paint || !ctx || !prev || !walls.current) return;
    redoStack.current.push(ctx.getImageData(0, 0, paint.width, paint.height));
    ctx.putImageData(prev, 0, 0);
    setProgress(paintedPercent(prev, walls.current));
    syncFreeformHistory();
  }

  function redo() {
    if (isRegions) return regionRef.current?.redo();
    if (style === "mosaic") return gridRef.current?.redo();
    const paint = paintRef.current;
    const ctx = paint?.getContext("2d");
    const next = redoStack.current.pop();
    if (!paint || !ctx || !next || !walls.current) return;
    history.current.push(ctx.getImageData(0, 0, paint.width, paint.height));
    ctx.putImageData(next, 0, 0);
    setProgress(paintedPercent(next, walls.current));
    syncFreeformHistory();
  }

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, +Shift redo; 1-9 pick a colour.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        const have = isRegions ? (regions ? colourCount(regions) : 0) : palette.length;
        if (i < have) setSelected(i);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (finished) {
    return <FinishScreen preview={preview} title={title} onClose={() => setFinished(false)} onDownload={download} />;
  }

  const regionHexes = REGION_PALETTE.slice(0, Math.max(1, regions ? colourCount(regions) : 12)).map((c) => c.hex);
  const FINISH = (
    <button
      type="button"
      onClick={() => {
        setPreview(capture());
        setFinished(true);
      }}
      className={cn(
        "grid size-16 place-items-center rounded-full bg-surface/90 shadow-[var(--shadow-border)]",
        !isRegions && "absolute left-4 top-4",
      )}
      aria-label={`Finish artwork. ${progress}% painted.`}
    >
      <svg viewBox="0 0 36 36" className="size-14 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="14" fill="none" stroke="#e4d9c6" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke="#80601f"
          strokeWidth="3"
          strokeDasharray={`${(progress / 100) * 88} 88`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums text-gold-deep">{progress}%</span>
    </button>
  );
  const swatches = isRegions
    ? regionHexes
    : palette.length
      ? palette
      : ["#d4a39a", "#8aa090", "#6e8b82", "#c9bdd4", "#f6f1e6"];
  const undoable = style === "mosaic" && !isRegions ? true : canUndo;
  const redoable = style === "mosaic" && !isRegions ? true : canRedo;

  return (
    <div className="damask flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-h-11 min-w-11 items-center gap-2 text-gold-deep" aria-label="Home">
          <Home className="size-5" aria-hidden />
          <span className="hidden font-display text-xl sm:inline">Nou Paint</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-display text-lg">{title}</h1>
          <p className="text-xs text-muted">
            {isRegions ? "Numbered regions" : style === "mosaic" ? "Square grid" : "Freeform"} ·{" "}
            {page?.premium ? "Paid pack" : "Free"}
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          className="grid size-11 place-items-center rounded-full text-gold-deep"
          aria-label="Save picture to this device"
        >
          <Download className="size-5" aria-hidden />
        </button>
      </header>

      <main id="main" className="relative mx-auto w-full max-w-4xl flex-1 px-4 pb-3">
        <div className="relative overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-border)]">
          <div className={cn("relative w-full", !isRegions && "aspect-square")}>
            {isRegions ? (
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  {FINISH}
                  <p className="text-sm text-muted">
                    Tap a region, or use the arrow keys and Enter. Numbers match the colours below.
                  </p>
                </div>
                {regions ? (
                  <RegionPainter
                    ref={regionRef}
                    regions={regions}
                    title={title}
                    selected={selected}
                    strict={strict}
                    palette={regionHexes}
                    zoom={zoom}
                    onProgress={setProgress}
                    onHistory={onRegionHistory}
                  />
                ) : (
                  !loadError && <p className="py-16 text-center text-muted">Loading…</p>
                )}
              </div>
            ) : style === "mosaic" ? (
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
                <canvas ref={lineRef} className="absolute inset-0 h-full w-full" aria-hidden />
                <canvas
                  ref={paintRef}
                  className="absolute inset-0 h-full w-full touch-none"
                  tabIndex={0}
                  role="application"
                  aria-label="Freeform painting canvas. Arrow keys move the brush, Enter or Space paints the area."
                  onPointerDown={paintAt}
                  onKeyDown={freeformKey}
                  onBlur={() => setCursor(null)}
                />
                {cursor && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-surface/60"
                    style={{
                      left: `${cursor.x * 100}%`,
                      top: `${cursor.y * 100}%`,
                    }}
                  />
                )}
              </>
            )}
          </div>
          {!isRegions && FINISH}
        </div>
        {loadError && (
          <p role="alert" className="mt-3 text-center text-sm">
            This picture could not be loaded.
          </p>
        )}
        <p className="sr-only" aria-live="polite" data-testid="progress-live">
          {progress}% painted
        </p>
      </main>

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[28px] bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Colours">
            <p className="text-xs tracking-wide text-muted uppercase" aria-hidden>
              Colours
            </p>
            {swatches.map((hex, i) => (
              <button
                key={`${hex}-${i}`}
                type="button"
                aria-label={isRegions ? `Colour ${i + 1}, ${REGION_PALETTE[i]?.name ?? ""}` : `Colour ${i + 1}`}
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
                className={cn(
                  "relative size-11 rounded-full shadow-[var(--shadow-border)]",
                  selected === i && "ring-[3px] ring-ink ring-offset-2 ring-offset-surface",
                )}
                style={{ background: hex }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center text-xs font-semibold"
                  style={{ color: labelColorFor(hex) }}
                >
                  {i + 1}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!undoable}
              className="grid size-11 place-items-center text-ink disabled:opacity-40"
              aria-label="Undo"
            >
              <Undo2 className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!redoable}
              className="grid size-11 place-items-center text-ink disabled:opacity-40"
              aria-label="Redo"
            >
              <Redo2 className="size-5" aria-hidden />
            </button>
            <div className="flex items-center gap-1 text-sm tabular-nums text-muted" role="group" aria-label="Zoom">
              <button
                type="button"
                className="grid size-11 place-items-center"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(80, z - 10))}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span aria-live="polite">{zoom}%</span>
              <button
                type="button"
                className="grid size-11 place-items-center"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(160, z + 10))}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            {!isRegions && (
              <div className="flex rounded-xl bg-ink/5 p-1" role="group" aria-label="Painting style">
                <button
                  type="button"
                  aria-pressed={style === "freeform"}
                  onClick={() => setStyle("freeform")}
                  className={cn(
                    "inline-flex h-11 min-w-11 items-center gap-1 rounded-lg px-3 text-sm",
                    style === "freeform" ? "bg-paper text-ink shadow-[var(--shadow-border)]" : "text-muted",
                  )}
                >
                  <Pencil className="size-4" aria-hidden />
                  Freeform
                </button>
                <button
                  type="button"
                  aria-pressed={style === "mosaic"}
                  onClick={() => setStyle("mosaic")}
                  className={cn(
                    "inline-flex h-11 min-w-11 items-center gap-1 rounded-lg px-3 text-sm",
                    style === "mosaic" ? "bg-paper text-ink shadow-[var(--shadow-border)]" : "text-muted",
                  )}
                >
                  <Grid2x2 className="size-4" aria-hidden />
                  Square
                </button>
              </div>
            )}
            {(isRegions || style === "mosaic") && (
              <button
                type="button"
                aria-pressed={strict}
                onClick={() => setStrict((v) => !v)}
                className={cn(
                  "h-11 min-w-11 rounded-lg px-3 text-sm",
                  strict ? "bg-gold/15 text-gold-deep" : "text-muted",
                )}
              >
                {strict ? "Match numbers" : "Any colour"}
              </button>
            )}
            <div className="flex-1" />
            <span className="text-sm tabular-nums text-gold-deep" aria-hidden>
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
