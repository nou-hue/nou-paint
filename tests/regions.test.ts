import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_UNDO,
  TARGET_PX,
  colourCount,
  eraseRegion,
  flattenPath,
  labelAnchor,
  moveFocus,
  nextToPaint,
  paintRegion,
  parseRegionSvg,
  pathBox,
  redoPaint,
  regionMetrics,
  regionProgress,
  renderPaintedSvg,
  resolveTap,
  stepRegion,
  undoPaint,
  emptyHistory,
  type Region,
} from "../src/lib/paint/regions";
import { REGION_PALETTE } from "../src/lib/paint/palette";

// TEST FIXTURE ONLY. Never shipped (see tests/regions-assets.test.ts).
const fixture = readFileSync("tests/fixtures/chahar-bagh-DRAFT.svg", "utf8");

const wrap = (inner: string, vb = "0 0 800 800") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;
const sq = (id: string, n: number, x: number, y: number, s = 100): Region => ({
  id,
  n,
  d: `M${x} ${y}h${s}v${s}h-${s}Z`,
  cx: x + s / 2,
  cy: y + s / 2,
});

describe("parseRegionSvg", () => {
  const parsed = parseRegionSvg(fixture);
  if (!parsed.ok) throw new Error(parsed.error);
  const regions = parsed.regions;

  it("reads every path of the fixture as {id, n, d, cx, cy}", () => {
    expect(regions).toHaveLength(80);
    expect(new Set(regions.map((r) => r.id)).size).toBe(80);
    const ns = new Set(regions.map((r) => r.n));
    expect([...ns].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(colourCount(regions)).toBe(8);
    for (const r of regions) {
      expect(Object.keys(r).sort()).toEqual(["cx", "cy", "d", "id", "n"]);
      expect(r.cx).toBeGreaterThanOrEqual(0);
      expect(r.cx).toBeLessThanOrEqual(800);
      expect(r.cy).toBeGreaterThanOrEqual(0);
      expect(r.cy).toBeLessThanOrEqual(800);
    }
  });

  it("matches the author's own label anchors closely enough to sit inside each shape's box", () => {
    const truth = JSON.parse(readFileSync("tests/fixtures/chahar-bagh-DRAFT.regions.json", "utf8")) as { regions: Region[] };
    expect(truth.regions).toHaveLength(80);
    for (const t of truth.regions) {
      const r = regions.find((x) => x.id === t.id)!;
      expect(r.d).toBe(t.d);
      expect(r.n).toBe(t.n);
      const b = pathBox(r.d);
      expect(r.cx, t.id).toBeGreaterThanOrEqual(b.minX - 0.5);
      expect(r.cx, t.id).toBeLessThanOrEqual(b.maxX + 0.5);
      expect(r.cy, t.id).toBeGreaterThanOrEqual(b.minY - 0.5);
      expect(r.cy, t.id).toBeLessThanOrEqual(b.maxY + 0.5);
    }
  });

  it("uses data-cx / data-cy when present and in range", () => {
    const r = parseRegionSvg(wrap(`<path id="a" data-n="3" data-cx="123" data-cy="456" d="M0 0h800v800H0Z"/>`));
    expect(r).toEqual({ ok: true, regions: [{ id: "a", n: 3, d: "M0 0h800v800H0Z", cx: 123, cy: 456 }] });
  });

  it.each([
    ["scripts", wrap(`<script>alert(1)</script><path id="a" data-n="1" d="M0 0h10v10Z"/>`), "unsafe_content"],
    ["event handlers", wrap(`<path id="a" data-n="1" onclick="x()" d="M0 0h10v10Z"/>`), "unsafe_content"],
    ["foreignObject", wrap(`<foreignObject/><path id="a" data-n="1" d="M0 0h10v10Z"/>`), "unsafe_content"],
    ["entities", `<!DOCTYPE svg [<!ENTITY x "y">]>` + wrap(`<path id="a" data-n="1" d="M0 0h10v10Z"/>`), "unsafe_content"],
    ["javascript: urls", wrap(`<a href="javascript:x"><path id="a" data-n="1" d="M0 0h10v10Z"/></a>`), "unsafe_content"],
    ["another viewBox", wrap(`<path id="a" data-n="1" d="M0 0h10v10Z"/>`, "0 0 1000 1000"), "bad_viewbox"],
    ["an offset viewBox", wrap(`<path id="a" data-n="1" d="M0 0h10v10Z"/>`, "5 0 800 800"), "bad_viewbox"],
    ["duplicate ids", wrap(`<path id="a" data-n="1" d="M0 0h10v10Z"/><path id="a" data-n="2" d="M0 0h10v10Z"/>`), "duplicate_id"],
    ["a missing id", wrap(`<path data-n="1" d="M0 0h10v10Z"/>`), "bad_id"],
    ["an odd id", wrap(`<path id="a b&quot;" data-n="1" d="M0 0h10v10Z"/>`), "bad_id"],
    ["a missing number", wrap(`<path id="a" d="M0 0h10v10Z"/>`), "bad_number"],
    ["a fractional number", wrap(`<path id="a" data-n="1.5" d="M0 0h10v10Z"/>`), "bad_number"],
    ["number 0", wrap(`<path id="a" data-n="0" d="M0 0h10v10Z"/>`), "bad_number"],
    ["number 100", wrap(`<path id="a" data-n="100" d="M0 0h10v10Z"/>`), "bad_number"],
    ["a path with letters it should not have", wrap(`<path id="a" data-n="1" d="M0 0 url(#x)"/>`), "bad_path"],
    ["a missing path", wrap(`<path id="a" data-n="1"/>`), "bad_path"],
    ["no regions", wrap(`<rect width="800" height="800"/>`), "no_regions"],
    ["no svg", "<html></html>", "no_svg"],
    ["empty input", "", "empty"],
  ])("refuses %s", (_name, text, error) => {
    expect(parseRegionSvg(text)).toEqual({ ok: false, error });
  });

  it("refuses an oversized file and too many regions", () => {
    expect(parseRegionSvg(wrap(" ".repeat(600_000)))).toEqual({ ok: false, error: "too_large" });
    const many = Array.from({ length: 401 }, (_, i) => `<path id="r${i}" data-n="1" d="M0 0h5v5Z"/>`).join("");
    expect(parseRegionSvg(wrap(many))).toEqual({ ok: false, error: "too_many_regions" });
  });
});

describe("path geometry", () => {
  it("handles absolute, relative, h/v and close commands", () => {
    const b = pathBox("M10 20h30v40h-30Z");
    expect([b.minX, b.minY, b.maxX, b.maxY, b.w, b.h]).toEqual([10, 20, 40, 60, 30, 40]);
  });

  it("flattens curves and arcs (a circle drawn with arcs spans its diameter)", () => {
    const b = pathBox("M100 200a50 50 0 1 0 100 0a50 50 0 1 0 -100 0Z");
    expect(b.w).toBeGreaterThan(98);
    expect(b.w).toBeLessThan(102);
    expect(b.h).toBeGreaterThan(98);
    expect(b.h).toBeLessThan(102);
    const q = pathBox("M0 0Q50 100 100 0");
    expect(q.maxY).toBeGreaterThan(45);
    expect(q.maxY).toBeLessThan(55);
    expect(flattenPath("M0 0C0 50 100 50 100 0Z")[0].length).toBeGreaterThan(4);
  });

  it("does not hang or throw on junk", () => {
    expect(() => flattenPath("M")).not.toThrow();
    expect(() => flattenPath("L5 5 Z Z Z")).not.toThrow();
    expect(() => pathBox("")).not.toThrow();
  });

  it("puts the label inside the shape, even for an L shape whose centre is empty", () => {
    const d = "M0 0h300v100H100v200H0Z"; // L shape: bbox centre (150,150) is outside the shape
    const p = labelAnchor(d);
    const inL = (x: number, y: number) => (x >= 0 && x <= 300 && y >= 0 && y <= 100) || (x >= 0 && x <= 100 && y >= 0 && y <= 300);
    expect(inL(p.x, p.y)).toBe(true);
    expect(inL(150, 150)).toBe(false);
  });

  it("puts a ring-shaped disc's label at its centre", () => {
    const p = labelAnchor("M100 200a50 50 0 1 0 100 0a50 50 0 1 0 -100 0Z");
    expect(Math.hypot(p.x - 150, p.y - 200)).toBeLessThan(6);
  });
});

describe("paint history (numbered fills, undo, redo)", () => {
  const a = sq("a", 1, 0, 0);
  const b = sq("b", 2, 200, 0);

  it("strict mode only takes a region's own number", () => {
    const h = emptyHistory();
    const bad = paintRegion(h, a, 2, true);
    expect(bad.outcome).toBe("wrong-number");
    expect(bad.history).toBe(h);
    const ok = paintRegion(h, a, 1, true);
    expect(ok.outcome).toBe("painted");
    expect(ok.history.present).toEqual({ a: 1 });
  });

  it("free mode takes any colour", () => {
    expect(paintRegion(emptyHistory(), a, 7, false).history.present).toEqual({ a: 7 });
  });

  it("painting the same colour again changes nothing and adds no undo step", () => {
    const h1 = paintRegion(emptyHistory(), a, 1, true).history;
    const again = paintRegion(h1, a, 1, true);
    expect(again.outcome).toBe("unchanged");
    expect(again.history).toBe(h1);
  });

  it("undoes and redoes one step at a time, and a new paint clears redo", () => {
    let h = emptyHistory();
    h = paintRegion(h, a, 1, true).history;
    h = paintRegion(h, b, 2, true).history;
    expect(h.present).toEqual({ a: 1, b: 2 });
    h = undoPaint(h);
    expect(h.present).toEqual({ a: 1 });
    h = undoPaint(h);
    expect(h.present).toEqual({});
    expect(undoPaint(h)).toBe(h);
    h = redoPaint(h);
    expect(h.present).toEqual({ a: 1 });
    h = paintRegion(h, b, 5, false).history;
    expect(h.future).toHaveLength(0);
    expect(redoPaint(h)).toBe(h);
  });

  it("erases a region, as an undoable step", () => {
    let h = paintRegion(emptyHistory(), a, 1, true).history;
    const e = eraseRegion(h, a);
    expect(e.outcome).toBe("erased");
    expect(e.history.present).toEqual({});
    expect(eraseRegion(e.history, a).outcome).toBe("unchanged");
    h = undoPaint(e.history);
    expect(h.present).toEqual({ a: 1 });
  });

  it("keeps at most MAX_UNDO steps", () => {
    let h = emptyHistory();
    for (let i = 0; i < MAX_UNDO + 30; i++) h = paintRegion(h, a, (i % 90) + 1, false).history;
    expect(h.past.length).toBe(MAX_UNDO);
  });

  it("never mutates a previous state", () => {
    const h0 = emptyHistory();
    const h1 = paintRegion(h0, a, 1, true).history;
    expect(h0.present).toEqual({});
    paintRegion(h1, b, 2, true);
    expect(h1.present).toEqual({ a: 1 });
  });
});

describe("progress", () => {
  const rs = [sq("a", 1, 0, 0), sq("b", 2, 200, 0), sq("c", 3, 400, 0), sq("d", 3, 600, 0)];
  it("counts painted regions as a whole-number percent", () => {
    expect(regionProgress(rs, {})).toBe(0);
    expect(regionProgress(rs, { a: 1 })).toBe(25);
    expect(regionProgress(rs, { a: 1, b: 2, c: 3 })).toBe(75);
    expect(regionProgress(rs, { a: 1, b: 2, c: 3, d: 3 })).toBe(100);
    expect(regionProgress([], {})).toBe(0);
  });
  it("counts a wrong-coloured region as painted (free mode)", () => {
    expect(regionProgress(rs, { a: 9 })).toBe(25);
  });
});

describe("keyboard navigation", () => {
  // 3 x 2 grid, ids g<row><col>
  const grid = [0, 1].flatMap((row) => [0, 1, 2].map((col) => sq(`g${row}${col}`, row * 3 + col + 1, 100 + col * 200, 100 + row * 200)));

  it("arrow keys go to the nearest region in that direction and stay put at the edge", () => {
    expect(moveFocus(grid, "g00", "right")).toBe("g01");
    expect(moveFocus(grid, "g01", "right")).toBe("g02");
    expect(moveFocus(grid, "g02", "right")).toBe("g02");
    expect(moveFocus(grid, "g11", "up")).toBe("g01");
    expect(moveFocus(grid, "g01", "up")).toBe("g01");
    expect(moveFocus(grid, "g12", "left")).toBe("g11");
    expect(moveFocus(grid, "g02", "down")).toBe("g12");
  });

  it("starts from the first region when nothing is focused, and copes with no regions", () => {
    expect(moveFocus(grid, null, "right")).toBe("g01");
    expect(moveFocus([], null, "right")).toBeNull();
  });

  it("every region can be reached from the keyboard (arrow keys plus [ and ])", () => {
    const parsed = parseRegionSvg(fixture);
    if (!parsed.ok) throw new Error(parsed.error);
    const rs = parsed.regions;
    const seen = new Set<string>([rs[0].id]);
    const queue = [rs[0].id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const dir of ["left", "right", "up", "down"] as const) {
        const to = moveFocus(rs, id, dir)!;
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
      for (const by of [1, -1] as const) {
        const to = stepRegion(rs, id, by)!;
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    expect(seen.size).toBe(rs.length);
  });

  it("[ and ] step through page order and wrap", () => {
    expect(stepRegion(grid, "g00", 1)).toBe("g01");
    expect(stepRegion(grid, "g12", 1)).toBe("g00");
    expect(stepRegion(grid, "g00", -1)).toBe("g12");
    expect(stepRegion(grid, null, 1)).toBe("g00");
    expect(stepRegion(grid, null, -1)).toBe("g12");
    expect(stepRegion([], null, 1)).toBeNull();
  });

  it("F finds the next unpainted region that wants the colour in hand", () => {
    const rs = [sq("a", 1, 0, 0), sq("b", 2, 200, 0), sq("c", 1, 400, 0), sq("d", 1, 600, 0)];
    expect(nextToPaint(rs, {}, 1, "a")).toBe("c");
    expect(nextToPaint(rs, { c: 1 }, 1, "a")).toBe("d");
    expect(nextToPaint(rs, { c: 1, d: 1 }, 1, "a")).toBe("a");
    expect(nextToPaint(rs, { a: 1, c: 1, d: 1 }, 1, "a")).toBeNull();
    expect(nextToPaint(rs, {}, 9, null)).toBeNull();
  });
});

describe("tap targets (44px)", () => {
  const big = sq("big", 1, 100, 100, 400);
  const tiny = sq("tiny", 2, 300, 300, 10);
  const rs = [big, tiny];
  const metrics = regionMetrics(rs);
  const scale = 0.5; // 800 units shown at 400 css px, so the tiny square is 5px wide

  it("keeps a comfortable region as it is", () => {
    expect(resolveTap(rs, metrics, "big", { x: 200, y: 200 }, 1)).toBe("big");
  });

  it("snaps a tap near a tiny region to it (within 22 css px)", () => {
    // tiny centre = (305,305). 30 units away = 15 css px at scale 0.5: inside the 22px radius.
    expect(resolveTap(rs, metrics, "big", { x: 335, y: 305 }, scale)).toBe("tiny");
    expect(resolveTap(rs, metrics, null, { x: 335, y: 305 }, scale)).toBe("tiny");
  });

  it("does not snap from further away than 22 css px", () => {
    expect(resolveTap(rs, metrics, "big", { x: 305 + 60, y: 305 }, scale)).toBe("big");
    expect(resolveTap(rs, metrics, null, { x: 700, y: 700 }, scale)).toBeNull();
  });

  it("a hit on a tiny region is always that region", () => {
    expect(resolveTap(rs, metrics, "tiny", { x: 302, y: 302 }, scale)).toBe("tiny");
  });

  it("uses the 44px target", () => {
    expect(TARGET_PX).toBe(44);
  });
});

describe("renderPaintedSvg (our own markup, never the delivered file)", () => {
  const rs = [sq("a", 1, 0, 0), sq("b", 2, 200, 0)];
  const pal = REGION_PALETTE.map((c) => c.hex);

  it("fills painted regions and keeps numbers only on unpainted ones", () => {
    const svg = renderPaintedSvg(rs, { a: 1 }, pal, { numbers: true });
    expect(svg).toContain('viewBox="0 0 800 800"');
    expect(svg).toContain(`fill="${pal[0]}"`);
    expect((svg.match(/<text/g) ?? []).length).toBe(1);
    expect(renderPaintedSvg(rs, { a: 1 }, pal, { numbers: false })).not.toContain("<text");
  });

  it("emits no script, no external reference, and tolerates hostile palette entries", () => {
    const svg = renderPaintedSvg(rs, { a: 1, b: 2 }, ['"><script>x</script>', "red"], {});
    expect(svg).not.toMatch(/<script|javascript:|https?:\/\/(?!www\.w3\.org)|\son[a-z]+=/i);
  });
});

describe("region palette", () => {
  it("has 12 distinct colours, none equal to the paper", () => {
    const hexes = REGION_PALETTE.map((c) => c.hex.toLowerCase());
    expect(hexes).toHaveLength(12);
    expect(new Set(hexes).size).toBe(12);
    expect(hexes).not.toContain("#f7f1e8");
    for (const c of REGION_PALETTE) expect(c.name.length).toBeGreaterThan(0);
  });
});
