import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { REGION_PALETTE } from "@/lib/paint/palette";
import {
  REGION_VIEWBOX,
  emptyHistory,
  eraseRegion,
  labelSize,
  moveFocus,
  nextToPaint,
  paintRegion,
  redoPaint,
  regionMetrics,
  regionProgress,
  renderPaintedSvg,
  resolveTap,
  stepRegion,
  undoPaint,
  type Dir,
  type PaintHistory,
  type Region,
} from "@/lib/paint/regions";
import { cn } from "@/lib/utils";

export type RegionPainterHandle = {
  undo: () => void;
  redo: () => void;
  /** Standalone SVG of the painting so far (for the finish screen and saving to the device). */
  exportSvg: () => string;
};

type Props = {
  regions: readonly Region[];
  title: string;
  /** 0-based index into `palette` of the colour in hand. */
  selected: number;
  /** Strict = a region only takes its own number's colour. */
  strict: boolean;
  /** Hex colours; number n uses palette[n - 1]. */
  palette?: readonly string[];
  /** Zoom percent (80 to 160). */
  zoom?: number;
  showNumbers?: boolean;
  onProgress?: (percent: number) => void;
  onHistory?: (h: { canUndo: boolean; canRedo: boolean }) => void;
};

const PAPER = "#f7f1e8";
const INK = "#2c261e";
const DEFAULT_PALETTE = REGION_PALETTE.map((c) => c.hex);

/**
 * Numbered SVG region painter. Tap or click a region to fill it. From the
 * keyboard: Tab to the board, arrow keys move between regions, Enter or Space
 * paints, Delete erases, [ and ] step through regions, F finds the next region
 * for the colour in hand. Ctrl/Cmd+Z undoes (handled by the page).
 */
export const RegionPainter = forwardRef<RegionPainterHandle, Props>(function RegionPainter(
  { regions, title, selected, strict, palette = DEFAULT_PALETTE, zoom = 100, showNumbers = true, onProgress, onHistory },
  ref,
) {
  const [hist, setHist] = useState<PaintHistory>(emptyHistory);
  const [focusId, setFocusId] = useState<string | null>(regions[0]?.id ?? null);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const metrics = useMemo(() => regionMetrics(regions), [regions]);
  const colour = selected + 1;
  const colourHex = palette[selected] ?? "#d4a39a";

  // A different page starts clean.
  useEffect(() => {
    setHist(emptyHistory());
    setFocusId(regions[0]?.id ?? null);
    setStatus("");
  }, [regions]);

  const progress = regionProgress(regions, hist.present);
  const painted = Object.keys(hist.present).length;
  useEffect(() => onProgress?.(progress), [progress, onProgress]);
  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;
  useEffect(() => onHistory?.({ canUndo, canRedo }), [canUndo, canRedo, onHistory]);

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        setHist((h) => undoPaint(h));
        setStatus("Undone.");
      },
      redo: () => {
        setHist((h) => redoPaint(h));
        setStatus("Redone.");
      },
      exportSvg: () => renderPaintedSvg(regions, hist.present, palette, { numbers: false }),
    }),
    [regions, hist.present, palette],
  );

  const describe = useCallback(
    (r: Region, fills: PaintHistory["present"]) => {
      const c = fills[r.id];
      return `Region ${regions.findIndex((x) => x.id === r.id) + 1} of ${regions.length}, number ${r.n}, ${
        c ? `painted with colour ${c}` : "not painted"
      }.`;
    },
    [regions],
  );

  const act = useCallback(
    (r: Region, erase = false) => {
      setFocusId(r.id);
      const res = erase ? eraseRegion(hist, r) : paintRegion(hist, r, colour, strict);
      setHist(res.history);
      setStatus(
        res.outcome === "painted"
          ? `Painted number ${r.n} with colour ${colour}.`
          : res.outcome === "erased"
            ? `Cleared number ${r.n}.`
            : res.outcome === "wrong-number"
              ? `That is number ${r.n}. Pick colour ${r.n} to paint it.`
              : erase
                ? "Nothing to clear there."
                : "Already that colour.",
      );
    },
    [hist, colour, strict],
  );

  const focus = useCallback(
    (id: string | null) => {
      if (!id) return;
      setFocusId(id);
      const r = regions.find((x) => x.id === id);
      if (r) setStatus(describe(r, hist.present));
    },
    [regions, describe, hist.present],
  );

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    if (box.width === 0) return;
    const scale = box.width / 800;
    const at = { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    const hit = (e.target as Element).getAttribute?.("data-region") ?? null;
    const id = resolveTap(regions, metrics, hit, at, scale);
    const r = regions.find((x) => x.id === id);
    if (!r) return;
    svg.focus({ preventScroll: true });
    act(r, false);
  }

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = regions.find((r) => r.id === focusId) ?? regions[0];
    const dirs: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (dirs[e.key]) {
      e.preventDefault();
      focus(moveFocus(regions, cur?.id ?? null, dirs[e.key]));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (cur) act(cur);
    } else if (e.key === "Delete" || e.key === "Backspace" || e.key.toLowerCase() === "e") {
      e.preventDefault();
      if (cur) act(cur, true);
    } else if (e.key === "]") {
      e.preventDefault();
      focus(stepRegion(regions, cur?.id ?? null, 1));
    } else if (e.key === "[") {
      e.preventDefault();
      focus(stepRegion(regions, cur?.id ?? null, -1));
    } else if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      findNext();
    }
  }

  function findNext() {
    const id = nextToPaint(regions, hist.present, colour, focusId);
    if (!id) setStatus(`Every number ${colour} is painted.`);
    else {
      focus(id);
      svgRef.current?.focus({ preventScroll: true });
    }
  }

  const current = regions.find((r) => r.id === focusId) ?? null;
  const wantsColour = (r: Region) => r.n === colour && hist.present[r.id] === undefined;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <svg
          ref={svgRef}
          viewBox={REGION_VIEWBOX}
          style={{ width: `${zoom}%` }}
          className="mx-auto block h-auto touch-manipulation select-none outline-none"
          role="application"
          tabIndex={0}
          aria-label={`${title}. Numbered painting with ${regions.length} regions. Arrow keys move between regions, Enter paints, Delete clears.`}
          aria-describedby="region-status"
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            if (current) setStatus(describe(current, hist.present));
          }}
          onBlur={() => setFocused(false)}
        >
          <rect width="800" height="800" fill="#f3eee6" data-bg />
          {regions.map((r) => {
            const c = hist.present[r.id];
            const hint = !c && wantsColour(r);
            return (
              <path
                key={r.id}
                data-region={r.id}
                d={r.d}
                fill={c ? (palette[c - 1] ?? PAPER) : PAPER}
                stroke={hint ? "#80601f" : INK}
                strokeWidth={hint ? 3.2 : 2.2}
                strokeDasharray={hint ? "7 5" : undefined}
                strokeLinejoin="round"
                className="cursor-pointer"
              />
            );
          })}
          {showNumbers &&
            regions.map((r) =>
              hist.present[r.id] !== undefined ? null : (
                <text
                  key={`n-${r.id}`}
                  x={r.cx}
                  y={r.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={INK}
                  fontSize={labelSize(metrics[r.id])}
                  fontWeight={600}
                  fontFamily="Figtree, sans-serif"
                  style={{ pointerEvents: "none" }}
                >
                  {r.n}
                </text>
              ),
            )}
          {focused && current && (
            <path
              d={current.d}
              fill="none"
              stroke="#ffffff"
              strokeWidth={7}
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
              data-testid="focus-outer"
            />
          )}
          {focused && current && (
            <path
              d={current.d}
              fill="none"
              stroke="#1d4ed8"
              strokeWidth={4}
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
              data-testid="focus-ring"
            />
          )}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-2 pt-2" role="group" aria-label="Move between regions">
        <button
          type="button"
          onClick={() => focus(stepRegion(regions, focusId, -1))}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-3 text-sm text-ink"
          aria-label="Previous region"
        >
          <ChevronLeft className="size-5" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <button
          type="button"
          onClick={findNext}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-paper px-3 text-sm text-ink shadow-[var(--shadow-border)]"
          aria-label={`Find next number ${colour}`}
        >
          <Crosshair className="size-5" aria-hidden />
          <span>Find {colour}</span>
          <span aria-hidden className="size-4 rounded-full border border-ink/30" style={{ background: colourHex }} />
        </button>
        <button
          type="button"
          onClick={() => focus(stepRegion(regions, focusId, 1))}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-3 text-sm text-ink"
          aria-label="Next region"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => current && act(current)}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
          aria-label={`Paint the selected region with colour ${colour}`}
        >
          Paint
        </button>
      </div>

      <p id="region-status" role="status" aria-live="polite" className="min-h-6 px-2 pt-1 text-center text-sm" data-testid="region-status">
        {status}
      </p>
      <p className="text-center text-sm tabular-nums text-muted" data-testid="region-count">
        {painted} / {regions.length} regions
      </p>
    </div>
  );
});

/** A small non-interactive preview of a region page (gallery cards). */
export function RegionThumb({ regions, className }: { regions: readonly Region[]; className?: string }) {
  return (
    <svg viewBox={REGION_VIEWBOX} className={cn("h-full w-full", className)} aria-hidden>
      <rect width="800" height="800" fill="#f3eee6" />
      {regions.map((r) => (
        <path key={r.id} d={r.d} fill={PAPER} stroke={INK} strokeWidth={3} />
      ))}
    </svg>
  );
}
