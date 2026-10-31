import { Link } from "@tanstack/react-router";
import { Check, Download, Grid2x2, Home, Lock, Maximize2, Minus, Pencil, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Celebration } from "@/components/Celebration";
import { FinishScreen } from "@/components/FinishScreen";
import { GridPainter, type GridHandle } from "@/components/GridPainter";
import { RegionPainter, type ColourCounts, type RegionPainterHandle } from "@/components/RegionPainter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UnlockDialog } from "@/components/UnlockDialog";
import { pageById, type StudioPage } from "@/lib/paint/catalog";
import { REGION_PALETTE } from "@/lib/paint/palette";
import { colourCount, parseRegionSvg, type Region } from "@/lib/paint/regions";
import { drawContained, floodFill, floodSimilar, labelColorFor, loadImage, paintedPercent } from "@/lib/paint/engine";
import { haptic } from "@/lib/haptics";
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
    <main id="main" className="damask relative grid min-h-dvh place-items-center px-5 py-10">
      <ThemeToggle className="absolute right-3 top-3" />
      <div className="card anim-sheet w-full max-w-md p-4 text-center" data-testid="paywall">
        <div className="relative overflow-hidden rounded-[22px]">
          {page?.teaser ? (
            <img src={page.teaser} alt="" className="aspect-square w-full object-cover" aria-hidden />
          ) : (
            <div className="skeleton aspect-square w-full" aria-hidden />
          )}
          {access !== "checking" && (
            <span className="glass-strong absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold text-ink">
              <Lock className="size-3.5" aria-hidden /> Paid pack
            </span>
          )}
        </div>
        <h1 className="mt-5 font-display text-4xl text-ink">{page?.title}</h1>
        {access === "checking" ? (
          <p className="mt-2 text-callout text-muted" role="status">
            Checking…
          </p>
        ) : (
          <>
            <p className="mx-auto mt-2 inline-flex items-center gap-2 text-callout text-muted">
              This page is part of a paid pack for grown-ups.
            </p>
            <button
              type="button"
              onClick={() => setUnlockOpen(true)}
              className="press mt-5 h-12 w-full rounded-full bg-accent px-4 text-body font-semibold text-accent-fg"
            >
              Unlock (grown-ups)
            </button>
          </>
        )}
        <Link to="/" className="press mt-2 inline-flex h-11 min-w-11 items-center rounded-full px-4 text-callout text-muted underline">
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
  // Freeform walls come from the page's LINE art, never from the colour (paint) image. Uploads are their own line art.
  const wallSrc = uploadSrc ?? page?.lineSource ?? src;
  const age = useAppStore((s) => s.age) ?? "adult";
  const style = useAppStore((s) => s.style);
  const setStyle = useAppStore((s) => s.setStyle);

  const [palette, setPalette] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [rzoom, setRzoom] = useState(1);
  const [counts, setCounts] = useState<ColourCounts | null>(null);
  const [celebrate, setCelebrate] = useState(false);
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

  const onComplete = useCallback(() => setCelebrate(true), []);

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
    loadImage(wallSrc)
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
  }, [wallSrc, style, isRegions]);

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
        "press glass-strong grid size-14 shrink-0 place-items-center rounded-full",
      )}
      aria-label={`Finish artwork. ${progress}% painted.`}
    >
      <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke="var(--color-gold-fill)"
          strokeWidth="3"
          strokeDasharray={`${(progress / 100) * 88} 88`}
          strokeLinecap="round"
          className="progress-arc"
        />
      </svg>
      <span className="num absolute text-caption font-semibold text-gold-deep">{progress}%</span>
    </button>
  );
  const swatches = isRegions
    ? regionHexes
    : palette.length
      ? palette
      : ["#d4a39a", "#8aa090", "#6e8b82", "#c9bdd4", "#f6f1e6"];
  const undoable = style === "mosaic" && !isRegions ? true : canUndo;
  const redoable = style === "mosaic" && !isRegions ? true : canRedo;
  const zoomPct = isRegions ? Math.round(rzoom * 100) : zoom;

  function pick(i: number) {
    if (i !== selected) haptic("select");
    setSelected(i);
  }
  const zoomOut = () => (isRegions ? regionRef.current?.zoomOut() : setZoom((z) => Math.max(80, z - 10)));
  const zoomIn = () => (isRegions ? regionRef.current?.zoomIn() : setZoom((z) => Math.min(160, z + 10)));

  return (
    <div className="damask flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 sm:px-6">
        <Link
          to="/"
          className="press glass flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-gold-deep"
          aria-label="Home"
        >
          <Home className="size-5" aria-hidden />
          <span className="hidden font-display text-xl sm:inline">Nou Paint</span>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-display text-xl leading-tight">{title}</h1>
          <p className="text-caption text-muted">
            {isRegions ? "Numbered regions" : style === "mosaic" ? "Square grid" : "Freeform"} ·{" "}
            {page?.premium ? "Paid pack" : "Free"}
          </p>
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={download}
          className="press glass grid size-11 place-items-center rounded-full text-gold-deep"
          aria-label="Save picture to this device"
        >
          <Download className="size-5" aria-hidden />
        </button>
      </header>

      <main id="main" className="relative mx-auto w-full max-w-4xl flex-1 px-3 pb-3 sm:px-4">
        <div className="paper-frame relative overflow-hidden p-3">
          <div className="flex items-center gap-3">
            {FINISH}
            <p className="text-callout text-muted">
              {isRegions
                ? "Tap a shape to colour it. Numbers match the colours below."
                : style === "mosaic"
                  ? "Tap a square to colour it. Numbers match the colours below."
                  : "Tap an area to fill it with the colour in hand."}
            </p>
          </div>
          {isRegions ? (
            <div className="painter-box mt-2">
              {regions ? (
                <RegionPainter
                  ref={regionRef}
                  regions={regions}
                  title={title}
                  selected={selected}
                  strict={strict}
                  palette={regionHexes}
                  onProgress={setProgress}
                  onHistory={onRegionHistory}
                  onComplete={onComplete}
                  onColourCounts={setCounts}
                  onZoom={setRzoom}
                />
              ) : loadError ? null : (
                <div className="skeleton mx-auto aspect-square h-full max-h-full rounded-[20px]" aria-label="Loading" role="status" />
              )}
            </div>
          ) : (
            <div className="board relative mx-auto mt-2 aspect-square w-full overflow-hidden rounded-[20px]">
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
          )}
        </div>
        {loadError && (
          <p role="alert" className="mt-3 text-center text-callout">
            This picture could not be loaded.
          </p>
        )}
        <p className="sr-only" aria-live="polite" data-testid="progress-live">
          {progress}% painted
        </p>
      </main>

      <div className="sticky bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div className="dock glass-strong mx-auto flex max-w-5xl flex-col gap-1 rounded-[28px] px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="strip sm:min-w-0 sm:flex-1" role="group" aria-label="Colours">
            {swatches.map((hex, i) => {
              const left = isRegions ? counts?.remaining[i] : undefined;
              const done = left === 0;
              return (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  aria-label={
                    (isRegions ? `Colour ${i + 1}, ${REGION_PALETTE[i]?.name ?? ""}` : `Colour ${i + 1}`) +
                    (left === undefined ? "" : done ? ", all painted" : `, ${left} left`)
                  }
                  aria-pressed={selected === i}
                  onClick={() => pick(i)}
                  className={cn("swatch press relative size-11 rounded-full", selected === i && "swatch-on")}
                  style={{ background: hex }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center text-caption font-semibold"
                    style={{ color: labelColorFor(hex) }}
                  >
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  {left !== undefined && !done && (
                    <span aria-hidden className="swatch-badge num">
                      {left}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:flex-nowrap">
            <button
              type="button"
              onClick={undo}
              disabled={!undoable}
              className="press grid size-11 place-items-center rounded-full text-ink disabled:opacity-40"
              aria-label="Undo"
            >
              <Undo2 className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!redoable}
              className="press grid size-11 place-items-center rounded-full text-ink disabled:opacity-40"
              aria-label="Redo"
            >
              <Redo2 className="size-5" aria-hidden />
            </button>
            <div className="flex items-center text-callout text-muted num" role="group" aria-label="Zoom">
              <button type="button" className="press grid size-11 place-items-center rounded-full" aria-label="Zoom out" onClick={zoomOut}>
                <Minus className="size-4" aria-hidden />
              </button>
              <span aria-live="polite" className="min-w-10 text-center">
                {zoomPct}%
              </span>
              <button type="button" className="press grid size-11 place-items-center rounded-full" aria-label="Zoom in" onClick={zoomIn}>
                <Plus className="size-4" aria-hidden />
              </button>
              {isRegions && rzoom > 1.02 && (
                <button
                  type="button"
                  className="press grid size-11 place-items-center rounded-full"
                  aria-label="Reset zoom"
                  onClick={() => regionRef.current?.resetView()}
                >
                  <Maximize2 className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {!isRegions && (
              <div className="seg flex rounded-full p-1" role="group" aria-label="Painting style">
                <button
                  type="button"
                  aria-pressed={style === "freeform"}
                  onClick={() => setStyle("freeform")}
                  className={cn("seg-btn press inline-flex h-11 min-w-11 items-center gap-1 rounded-full px-3 text-callout", style === "freeform" && "seg-on")}
                >
                  <Pencil className="size-4" aria-hidden />
                  Freeform
                </button>
                <button
                  type="button"
                  aria-pressed={style === "mosaic"}
                  onClick={() => setStyle("mosaic")}
                  className={cn("seg-btn press inline-flex h-11 min-w-11 items-center gap-1 rounded-full px-3 text-callout", style === "mosaic" && "seg-on")}
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
                className={cn("seg-btn press h-11 min-w-11 rounded-full px-3 text-callout", strict ? "seg-on seg-solo" : "text-muted")}
              >
                {strict ? "Match numbers" : "Any colour"}
              </button>
            )}
            <div className="flex-1" />
            <span className="num pr-2 text-callout font-semibold text-gold-deep" aria-hidden>
              {progress}%
            </span>
          </div>
        </div>
      </div>
      {celebrate && (
        <Celebration
          title={title}
          onKeepGoing={() => setCelebrate(false)}
          onSee={() => {
            setCelebrate(false);
            setPreview(capture());
            setFinished(true);
          }}
        />
      )}
    </div>
  );
}
