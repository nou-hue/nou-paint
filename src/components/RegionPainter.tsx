import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { haptic } from "@/lib/haptics";
import { usePrefersReducedMotion } from "@/lib/motion";
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
import { revealMs, revealRadius } from "@/lib/paint/reveal";
import {
  IDENTITY,
  clampView,
  isDrag,
  panBy,
  pinch,
  wheelFactor,
  zoomAt,
  type Pt,
  type View,
} from "@/lib/paint/viewport";
import { cn } from "@/lib/utils";

export type RegionPainterHandle = {
  undo: () => void;
  redo: () => void;
  /** Standalone SVG of the painting so far (for the finish screen and saving to the device). */
  exportSvg: () => string;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
};

export type ColourCounts = { remaining: number[]; total: number[] };

type Props = {
  regions: readonly Region[];
  title: string;
  /** 0-based index into `palette` of the colour in hand. */
  selected: number;
  /** Strict = a region only takes its own number's colour. */
  strict: boolean;
  /** Hex colours; number n uses palette[n - 1]. */
  palette?: readonly string[];
  showNumbers?: boolean;
  onProgress?: (percent: number) => void;
  onHistory?: (h: { canUndo: boolean; canRedo: boolean }) => void;
  /** Fired once each time the picture reaches 100%. */
  onComplete?: () => void;
  /** Regions still to paint, per colour number (index n - 1). */
  onColourCounts?: (c: ColourCounts) => void;
  /** Current zoom factor (1 = fit). */
  onZoom?: (k: number) => void;
};

/* The artwork is paper in both themes: colours must read on a light ground. */
const PAPER = "#f7f1e8";
const GROUND = "#f3eee6";
const INK = "#2c261e";
const DEFAULT_PALETTE = REGION_PALETTE.map((c) => c.hex);
const MILESTONES = [25, 50, 75] as const;

type Reveal = { id: string; from: Pt; r: number; ms: number; prev: string; next: string; seq: number };

/**
 * Numbered SVG region painter. Tap or click a region to fill it; the colour blooms outward from the tap
 * point, clipped to the region. Pinch (or ctrl+wheel, or + / -) to zoom, drag to pan once zoomed.
 * Keyboard: Tab to the board, arrows move between regions, Enter or Space paints, Delete erases,
 * [ and ] step through regions, F finds the next region for the colour in hand, + - 0 zoom.
 */
export const RegionPainter = forwardRef<RegionPainterHandle, Props>(function RegionPainter(
  {
    regions,
    title,
    selected,
    strict,
    palette = DEFAULT_PALETTE,
    showNumbers = true,
    onProgress,
    onHistory,
    onComplete,
    onColourCounts,
    onZoom,
  },
  ref,
) {
  const [hist, setHist] = useState<PaintHistory>(emptyHistory);
  const [focusId, setFocusId] = useState<string | null>(regions[0]?.id ?? null);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState("");
  const [view, setView] = useState<View>(IDENTITY);
  const [glide, setGlide] = useState(false); // spring the view only for button / key zooms, never mid-gesture
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [wrong, setWrong] = useState<{ id: string; seq: number } | null>(null);
  const [hintGone, setHintGone] = useState(false);
  const [side, setSide] = useState(0);

  const reduced = usePrefersReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const doneRef = useRef(false);
  const lastMilestone = useRef(0);
  const uid = useId().replace(/[^A-Za-z0-9]/g, "");
  const metrics = useMemo(() => regionMetrics(regions), [regions]);
  const colour = selected + 1;
  const colourHex = palette[selected] ?? "#d4a39a";

  /* ----- size the square stage to whatever room the page gives it ----- */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setSide(Math.floor(Math.min(el.clientWidth, el.clientHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (side > 0) setView((v) => clampView(v, side));
  }, [side]);

  /* ----- a different page starts clean ----- */
  useEffect(() => {
    setHist(emptyHistory());
    setFocusId(regions[0]?.id ?? null);
    setStatus("");
    setReveals({});
    setWrong(null);
    setView(IDENTITY);
    setHintGone(false);
    doneRef.current = false;
    lastMilestone.current = 0;
  }, [regions]);

  const progress = regionProgress(regions, hist.present);
  const painted = Object.keys(hist.present).length;
  useEffect(() => onProgress?.(progress), [progress, onProgress]);
  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;
  useEffect(() => onHistory?.({ canUndo, canRedo }), [canUndo, canRedo, onHistory]);
  useEffect(() => onZoom?.(view.k), [view.k, onZoom]);

  /* ----- per-colour counts for the palette ----- */
  const counts = useMemo<ColourCounts>(() => {
    const max = regions.reduce((m, r) => Math.max(m, r.n), 0);
    const total = Array<number>(max).fill(0);
    const remaining = Array<number>(max).fill(0);
    for (const r of regions) {
      total[r.n - 1]++;
      if (hist.present[r.id] === undefined) remaining[r.n - 1]++;
    }
    return { remaining, total };
  }, [regions, hist.present]);
  const countsKey = counts.remaining.join(",") + "|" + counts.total.join(",");
  useEffect(() => onColourCounts?.(counts), [countsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- completion + milestones ----- */
  useEffect(() => {
    if (progress >= 100 && regions.length > 0) {
      if (!doneRef.current) {
        doneRef.current = true;
        haptic("complete");
        onComplete?.();
      }
    } else {
      doneRef.current = false;
    }
    const hit = [...MILESTONES].reverse().find((m) => progress >= m) ?? 0;
    if (hit > lastMilestone.current && progress < 100) haptic("milestone");
    lastMilestone.current = hit;
  }, [progress, regions.length, onComplete]);

  const fillOf = useCallback((id: string, fills: PaintHistory["present"]) => {
    const c = fills[id];
    return c ? (palette[c - 1] ?? PAPER) : PAPER;
  }, [palette]);

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        setReveals({});
        setHist((h) => undoPaint(h));
        setStatus("Undone.");
        haptic("undo");
      },
      redo: () => {
        setReveals({});
        setHist((h) => redoPaint(h));
        setStatus("Redone.");
        haptic("undo");
      },
      exportSvg: () => renderPaintedSvg(regions, hist.present, palette, { numbers: false }),
      zoomIn: () => zoomBy(1.4),
      zoomOut: () => zoomBy(1 / 1.4),
      resetView: () => {
        setGlide(true);
        setView(IDENTITY);
      },
    }),
    [regions, hist.present, palette, side], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const frameSide = () => frameRef.current?.getBoundingClientRect().width || side || 1;

  function zoomBy(f: number) {
    const S = frameSide();
    setGlide(true);
    setView((v) => zoomAt(v, f, { x: S / 2, y: S / 2 }, S));
    setHintGone(true);
  }

  const describe = useCallback(
    (r: Region, fills: PaintHistory["present"]) => {
      const c = fills[r.id];
      return `Region ${regions.findIndex((x) => x.id === r.id) + 1} of ${regions.length}, number ${r.n}, ${
        c ? `painted with colour ${c}` : "not painted"
      }.`;
    },
    [regions],
  );

  /** Fill a region. `from` is the tap point in artwork units (null for keyboard: starts at the label). */
  const act = useCallback(
    (r: Region, erase = false, from: Pt | null = null) => {
      setFocusId(r.id);
      const res = erase ? eraseRegion(hist, r) : paintRegion(hist, r, colour, strict);
      setHist(res.history);
      setHintGone(true);
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
      if (res.outcome === "painted") {
        haptic("fill");
        if (!reduced) {
          const at = from ?? { x: r.cx, y: r.cy };
          const b = metrics[r.id];
          const box = b ? { x: b.minX, y: b.minY, w: b.w, h: b.h } : { x: 0, y: 0, w: 800, h: 800 };
          const rad = revealRadius(at, box);
          const ms = revealMs(rad);
          const id = r.id;
          const n = ++seq.current;
          setReveals((s) => ({
            ...s,
            [id]: { id, from: at, r: rad, ms, prev: fillOf(id, hist.present), next: palette[colour - 1] ?? PAPER, seq: n },
          }));
          window.setTimeout(() => setReveals((s) => (s[id]?.seq === n ? omit(s, id) : s)), ms + 160);
        }
      } else if (res.outcome === "wrong-number") {
        haptic("wrong");
        setWrong({ id: r.id, seq: ++seq.current });
      } else if (res.outcome === "erased") {
        haptic("undo");
      }
    },
    [hist, colour, strict, reduced, metrics, fillOf, palette],
  );

  const focus = useCallback(
    (id: string | null) => {
      if (!id) return;
      setFocusId(id);
      const r = regions.find((x) => x.id === id);
      if (!r) return;
      setStatus(describe(r, hist.present));
      // If zoomed in and the region is off-screen, glide to it.
      const S = frameRef.current?.getBoundingClientRect().width || side;
      if (S && view.k > 1) {
        const sx = view.x + (r.cx / 800) * S * view.k;
        const sy = view.y + (r.cy / 800) * S * view.k;
        if (sx < S * 0.12 || sx > S * 0.88 || sy < S * 0.12 || sy > S * 0.88) {
          setGlide(true);
          setView((v) => clampView({ ...v, x: S / 2 - (r.cx / 800) * S * v.k, y: S / 2 - (r.cy / 800) * S * v.k }, S));
        }
      }
    },
    [regions, describe, hist.present, view, side],
  );

  /* ----- pointer gestures: tap = paint, drag = pan, two fingers = pinch ----- */
  const ptrs = useRef(new Map<number, Pt>());
  const tap = useRef<{ start: Pt; hit: string | null; moved: boolean; multi: boolean } | null>(null);
  const pinchPrev = useRef<[Pt, Pt] | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const b = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: fine */
    }
    if (ptrs.current.size === 1) {
      const hit = (e.target as Element).getAttribute?.("data-region") ?? null;
      tap.current = { start: p, hit, moved: false, multi: false };
    } else if (tap.current) {
      tap.current.multi = true;
      const [a, b] = [...ptrs.current.values()];
      pinchPrev.current = [a, b];
    }
    setGlide(false);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!ptrs.current.has(e.pointerId)) return;
    const S = frameSide();
    const prevP = ptrs.current.get(e.pointerId)!;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    const t = tap.current;
    if (!t) return;
    if (ptrs.current.size >= 2 && pinchPrev.current) {
      const [a, b] = [...ptrs.current.values()];
      const prev = pinchPrev.current;
      pinchPrev.current = [a, b];
      setView((v) => pinch(v, prev, [a, b], S));
      setHintGone(true);
      return;
    }
    if (!t.moved && isDrag(t.start, p)) t.moved = true;
    if (t.moved) {
      setView((v) => panBy(v, p.x - prevP.x, p.y - prevP.y, S));
    }
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = local(e);
    ptrs.current.delete(e.pointerId);
    pinchPrev.current = null;
    const t = tap.current;
    if (ptrs.current.size > 0 || !t) return;
    tap.current = null;
    if (cancelled || t.moved || t.multi) return;
    // A clean tap: find the region under it (with snapping for tiny regions) and paint.
    const S = frameSide();
    const scale = (S * view.k) / 800;
    const at = { x: (p.x - view.x) / scale, y: (p.y - view.y) / scale };
    const id = resolveTap(regions, metrics, t.hit, at, scale);
    const r = regions.find((x) => x.id === id);
    if (!r) return;
    svgRef.current?.focus({ preventScroll: true });
    act(r, false, at);
  }

  /* wheel: ctrl/cmd (trackpad pinch) zooms, plain wheel pans once zoomed. Needs a non-passive listener. */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const b = el.getBoundingClientRect();
      const S = b.width;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setGlide(false);
        setView((v) => zoomAt(v, wheelFactor(e.deltaY, e.deltaMode), { x: e.clientX - b.left, y: e.clientY - b.top }, S));
        setHintGone(true);
      } else {
        setView((v) => {
          if (v.k <= 1) return v;
          e.preventDefault();
          setGlide(false);
          return panBy(v, -e.deltaX, -e.deltaY, S);
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(1.4);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1 / 1.4);
    } else if (e.key === "0") {
      e.preventDefault();
      setGlide(true);
      setView(IDENTITY);
    }
  }

  function findNext() {
    const id = nextToPaint(regions, hist.present, colour, focusId);
    if (!id) setStatus(`Every number ${colour} is painted.`);
    else {
      focus(id);
      svgRef.current?.focus({ preventScroll: true });
      haptic("select");
    }
  }

  const current = regions.find((r) => r.id === focusId) ?? null;
  const wantsColour = (r: Region) => r.n === colour && hist.present[r.id] === undefined;
  const zoomed = view.k > 1.02;
  const showHint = !hintGone && painted === 0 && regions.length > 0;

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={stageRef} className="relative grid min-h-0 flex-1 place-items-center">
        <div
          ref={frameRef}
          data-testid="paint-frame"
          className="paper-sheet relative touch-none overflow-hidden select-none"
          style={{ width: side > 0 ? side : "100%", aspectRatio: "1 / 1", maxHeight: "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endPointer(e, false)}
          onPointerCancel={(e) => endPointer(e, true)}
        >
          <div
            data-testid="paint-view"
            className={cn("h-full w-full", glide && "[transition:transform_var(--dur-slow)_var(--ease-spring)]")}
            style={{
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`,
              transformOrigin: "0 0",
              willChange: zoomed ? "transform" : undefined,
            }}
          >
            <svg
              ref={svgRef}
              viewBox={REGION_VIEWBOX}
              className="block h-full w-full outline-none"
              role="application"
              tabIndex={0}
              aria-label={`${title}. Numbered painting with ${regions.length} regions. Arrow keys move between regions, Enter paints, Delete clears, plus and minus zoom.`}
              aria-describedby="region-status"
              onKeyDown={onKeyDown}
              onFocus={() => {
                setFocused(true);
                if (current) setStatus(describe(current, hist.present));
              }}
              onBlur={() => setFocused(false)}
            >
              <rect width="800" height="800" fill={GROUND} data-bg />
              {regions.map((r) => {
                const rv = reveals[r.id];
                const hint = !hist.present[r.id] && wantsColour(r);
                const base = rv ? rv.prev : fillOf(r.id, hist.present);
                return (
                  <g key={r.id}>
                    <path
                      data-region={r.id}
                      d={r.d}
                      fill={base}
                      stroke={hint ? "#80601f" : INK}
                      strokeWidth={hint ? 3.2 : 2.2}
                      strokeDasharray={hint ? "7 5" : undefined}
                      strokeLinejoin="round"
                      className="cursor-pointer"
                    />
                    {rv && (
                      <g style={{ pointerEvents: "none" }} data-testid="reveal">
                        <clipPath id={`${uid}-c-${r.id}`}>
                          <path d={r.d} />
                        </clipPath>
                        <g clipPath={`url(#${uid}-c-${r.id})`}>
                          <circle
                            key={rv.seq}
                            cx={rv.from.x}
                            cy={rv.from.y}
                            r={rv.r}
                            fill={rv.next}
                            style={{
                              transformBox: "fill-box",
                              transformOrigin: "center",
                              animation: `bloom ${rv.ms}ms var(--ease-soft) both`,
                            }}
                          />
                          <circle
                            key={`ring-${rv.seq}`}
                            cx={rv.from.x}
                            cy={rv.from.y}
                            r={rv.r}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth={Math.max(6, rv.r * 0.06)}
                            style={{
                              transformBox: "fill-box",
                              transformOrigin: "center",
                              animation: `ring-out ${Math.round(rv.ms * 1.15)}ms var(--ease-out) both`,
                            }}
                          />
                        </g>
                        <path d={r.d} fill="none" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
                      </g>
                    )}
                  </g>
                );
              })}
              {showNumbers &&
                regions.map((r) =>
                  hist.present[r.id] !== undefined && !reveals[r.id] ? null : (
                    <text
                      key={`n-${r.id}`}
                      x={r.cx}
                      y={r.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={INK}
                      fontSize={labelSize(metrics[r.id])}
                      fontWeight={600}
                      fontFamily='"Figtree Variable", Figtree, sans-serif'
                      style={{ pointerEvents: "none" }}
                    >
                      {hist.present[r.id] !== undefined ? "" : r.n}
                    </text>
                  ),
                )}
              {wrong && regions.find((r) => r.id === wrong.id) && (
                <path
                  key={wrong.seq}
                  d={regions.find((r) => r.id === wrong.id)!.d}
                  fill="none"
                  stroke="#9a3412"
                  strokeWidth={7}
                  strokeLinejoin="round"
                  style={{ pointerEvents: "none", animation: "pulse-out 800ms var(--ease-out) both" }}
                  data-testid="wrong-pulse"
                />
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

          {showHint && (
            <p
              data-testid="paint-hint"
              className="anim-rise glass-strong pointer-events-none absolute top-3 left-1/2 w-max max-w-[88%] -translate-x-1/2 rounded-full px-4 py-2 text-center text-callout text-ink"
              style={{ ["--i" as string]: 3 }}
            >
              Tap a numbered shape to colour it. Pinch to zoom.
            </p>
          )}
          {zoomed && (
            <p
              aria-hidden
              className="anim-pop glass pointer-events-none absolute top-3 left-3 rounded-full px-3 py-1 text-caption text-ink num"
            >
              {Math.round(view.k * 100)}%
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-2 pt-3" role="group" aria-label="Move between regions">
        <button
          type="button"
          onClick={() => focus(stepRegion(regions, focusId, -1))}
          className="press inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-callout text-ink"
          aria-label="Previous region"
        >
          <ChevronLeft className="size-5" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <button
          type="button"
          onClick={findNext}
          className="press glass-strong inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-4 text-callout text-ink"
          aria-label={`Find next number ${colour}`}
        >
          <Crosshair className="size-5" aria-hidden />
          <span>Find {colour}</span>
          <span aria-hidden className="size-4 rounded-full border border-ink/30" style={{ background: colourHex }} />
        </button>
        <button
          type="button"
          onClick={() => focus(stepRegion(regions, focusId, 1))}
          className="press inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 text-callout text-ink"
          aria-label="Next region"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => current && act(current)}
          className="press inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-accent px-5 text-callout font-semibold text-accent-fg"
          aria-label={`Paint the selected region with colour ${colour}`}
        >
          Paint
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-3 px-3 pt-1">
        <p id="region-status" role="status" aria-live="polite" className="min-h-5 flex-1 truncate text-caption text-muted" data-testid="region-status">
          {status}
        </p>
        <p className="text-caption text-muted num" data-testid="region-count">
          {painted} / {regions.length} regions
        </p>
      </div>
    </div>
  );
});

function omit<T extends Record<string, unknown>>(o: T, k: string): T {
  const { [k]: _gone, ...rest } = o;
  return rest as T;
}

/** A small non-interactive preview of a region page (gallery cards). */
export function RegionThumb({ regions, className }: { regions: readonly Region[]; className?: string }) {
  return (
    <svg viewBox={REGION_VIEWBOX} className={cn("h-full w-full", className)} aria-hidden>
      <rect width="800" height="800" fill={GROUND} />
      {regions.map((r) => (
        <path key={r.id} d={r.d} fill={PAPER} stroke={INK} strokeWidth={3} />
      ))}
    </svg>
  );
}

