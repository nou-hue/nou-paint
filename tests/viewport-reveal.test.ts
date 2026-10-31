import { describe, expect, it } from "vitest";
import { revealMs, revealRadius } from "../src/lib/paint/reveal";
import {
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  clampView,
  doubleTapView,
  isDrag,
  panBy,
  pinch,
  toArtwork,
  wheelFactor,
  zoomAt,
} from "../src/lib/paint/viewport";

const S = 400;

describe("pinch-zoom and pan maths", () => {
  it("zoom is clamped and keeps the point under the finger fixed", () => {
    const v = zoomAt(IDENTITY, 2, { x: 300, y: 100 }, S);
    expect(v.k).toBe(2);
    expect(toArtwork(v, { x: 300, y: 100 }, S)).toEqual(toArtwork(IDENTITY, { x: 300, y: 100 }, S));
    expect(zoomAt(IDENTITY, 100, { x: 0, y: 0 }, S).k).toBe(MAX_ZOOM);
    expect(zoomAt(IDENTITY, 0.01, { x: 0, y: 0 }, S).k).toBe(MIN_ZOOM);
  });
  it("you can never pan the artwork off into empty space", () => {
    const v = panBy({ k: 2, x: 0, y: 0 }, 500, 500, S);
    expect(v.x).toBe(0);
    expect(panBy(v, -5000, -5000, S)).toMatchObject({ x: -S, y: -S });
    expect(clampView({ k: NaN, x: NaN, y: NaN }, S)).toEqual(IDENTITY);
  });
  it("two fingers spreading zoom in; moving together pans", () => {
    const out = pinch(IDENTITY, [{ x: 150, y: 200 }, { x: 250, y: 200 }], [{ x: 100, y: 200 }, { x: 300, y: 200 }], S);
    expect(out.k).toBeCloseTo(2, 5);
    expect(pinch(IDENTITY, [{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 9, y: 9 }], S)).toEqual(IDENTITY);
  });
  it("double-tap zooms in, then back out", () => {
    const z = doubleTapView(IDENTITY, { x: 200, y: 200 }, S);
    expect(z.k).toBeGreaterThan(2);
    expect(doubleTapView(z, { x: 200, y: 200 }, S)).toEqual(IDENTITY);
  });
  it("wheel zoom direction and bounds; tap versus drag", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-1e9)).toBe(wheelFactor(-120));
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe(true);
  });
});

describe("radial reveal geometry", () => {
  it("the circle always reaches the farthest corner of the region", () => {
    const box = { x: 100, y: 100, w: 200, h: 100 };
    const r = revealRadius({ x: 110, y: 110 }, box);
    expect(r).toBeGreaterThanOrEqual(Math.hypot(190, 90));
    expect(revealRadius({ x: 200, y: 150 }, box)).toBeLessThan(r);
  });
  it("small regions snap, big ones bloom, always under a second", () => {
    expect(revealMs(10)).toBeLessThan(revealMs(400));
    expect(revealMs(5000)).toBeLessThanOrEqual(600);
    expect(revealMs(0)).toBeGreaterThanOrEqual(260);
  });
});
