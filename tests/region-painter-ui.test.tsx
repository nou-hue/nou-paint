import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegionPainter, RegionThumb } from "../src/components/RegionPainter";
import { parseRegionSvg } from "../src/lib/paint/regions";
import { SAMPLE_REGIONS } from "../src/lib/paint/sample";

// TEST FIXTURE ONLY: never shipped.
const parsed = parseRegionSvg(readFileSync("tests/fixtures/chahar-bagh-DRAFT.svg", "utf8"));
if (!parsed.ok) throw new Error(parsed.error);
const regions = parsed.regions;

describe("RegionPainter markup", () => {
  const html = renderToStaticMarkup(<RegionPainter regions={regions} title="Test page" selected={0} strict={true} />);

  it("is one keyboard-focusable application surface with a name", () => {
    expect(html).toMatch(/<svg[^>]*role="application"/);
    expect(html).toMatch(/<svg[^>]*tabindex="0"/);
    expect(html).toMatch(/<svg[^>]*aria-label="Test page[^"]*"/);
    expect(html).toContain('viewBox="0 0 800 800"');
  });

  it("draws one path per region, with a number on each unpainted one", () => {
    expect((html.match(/data-region="/g) ?? []).length).toBe(regions.length);
    expect((html.match(/<text/g) ?? []).length).toBe(regions.length);
  });

  it("announces progress and state politely", () => {
    expect(html).toMatch(/role="status"[^>]*data-testid="region-status"|data-testid="region-status"[^>]*role="status"/);
    expect(html).toContain("0 / 80 regions");
  });

  it("every button is at least 44px (size-11 / h-11 and min-w-11)", () => {
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const b of buttons) expect(b, b).toMatch(/\b(size-11|h-11|min-h-11)\b/);
  });

  it("names the four on-screen controls", () => {
    for (const label of ["Previous region", "Next region", "Paint"]) expect(html).toContain(label);
    expect(html).toMatch(/Find 1/);
  });

  it("loads nothing from anywhere", () => {
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(html).not.toMatch(/<image|<script|<img/);
  });

  it("works on the free sample page and hides numbers when asked", () => {
    const free = renderToStaticMarkup(<RegionPainter regions={SAMPLE_REGIONS} title="Sample" selected={0} strict={false} showNumbers={false} />);
    expect((free.match(/data-region="/g) ?? []).length).toBe(SAMPLE_REGIONS.length);
    expect(free).not.toMatch(/<text/);
  });

  it("the thumbnail is decorative and unlabelled for assistive tech", () => {
    const t = renderToStaticMarkup(<RegionThumb regions={SAMPLE_REGIONS} />);
    expect(t).toContain("<svg");
    expect(t).toMatch(/aria-hidden="true"/);
    expect(t).not.toMatch(/tabindex/);
  });
});
