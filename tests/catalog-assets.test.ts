import { existsSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIFFICULTY_LABEL, PACKS, STUDIO_PAGES, packForPage, pagesForAge } from "../src/lib/paint/catalog";

describe("premium vs free catalog", () => {
  const premium = STUDIO_PAGES.filter((p) => p.premium);

  it("has premium pages, each tied to a real pack", () => {
    expect(premium.length).toBeGreaterThan(0);
    for (const p of premium) {
      expect(p.packId && PACKS[p.packId]).toBeTruthy();
      expect(PACKS[p.packId!].pageIds).toContain(p.id);
      expect(packForPage(p.id)).toBe(p.packId);
    }
  });

  it("kids pages are free: no premium page ever appears in the children collection", () => {
    const kids = pagesForAge("child");
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.some((p) => p.premium)).toBe(false);
  });

  it("premium pages load through the server route, never a static file", () => {
    for (const p of premium) {
      expect(p.source).toBe(`/api/page/${p.id}`);
      expect(p.art).not.toMatch(/-paint\.jpg|-line\.jpg/);
    }
  });

  it("free pages stay plain public files (anonymous, no server round trip)", () => {
    for (const p of STUDIO_PAGES.filter((x) => !x.premium && x.format !== "regions")) {
      expect(p.source).toMatch(/^\/pages\//);
      expect(existsSync(`public${p.source}`), p.source).toBe(true);
    }
  });
});

describe("premium image files", () => {
  it("originals live in /private, not in /public", () => {
    for (const p of STUDIO_PAGES.filter((x) => x.premium)) {
      expect(existsSync(`private/pages/${p.id}-paint.jpg`)).toBe(true);
      expect(existsSync(`public/pages/${p.id}-paint.jpg`)).toBe(false);
      expect(existsSync(`public/pages/${p.id}-line.jpg`)).toBe(false);
    }
  });

  it("the public teaser is tiny, so it is not a usable copy of the page", () => {
    for (const p of STUDIO_PAGES.filter((x) => x.premium)) {
      const f = `public/pages/preview/${p.id}.jpg`;
      expect(existsSync(f)).toBe(true);
      expect(statSync(f).size).toBeLessThan(30_000);
    }
  });

  it("public/pages holds no premium originals at all", () => {
    const names = readdirSync("public/pages");
    for (const p of STUDIO_PAGES.filter((x) => x.premium)) {
      expect(names.filter((n) => n.startsWith(p.id))).toEqual([]);
    }
  });
});

describe("difficulty and page formats", () => {
  it("knows Easy, Calm, Dreamy and Intricate, each with a label", () => {
    expect(Object.keys(DIFFICULTY_LABEL).sort()).toEqual(["calm", "dreamy", "easy", "intricate"]);
    for (const v of Object.values(DIFFICULTY_LABEL)) expect(v.length).toBeGreaterThan(0);
    expect(DIFFICULTY_LABEL.calm).toBe("Calm");
    expect(DIFFICULTY_LABEL.dreamy).toBe("Dreamy");
    expect(DIFFICULTY_LABEL.intricate).toBe("Intricate");
  });

  it("every page uses a known difficulty", () => {
    for (const p of STUDIO_PAGES) expect(Object.keys(DIFFICULTY_LABEL), p.id).toContain(p.difficulty);
  });

  it("the free region page ships its regions inline and is open to everyone", () => {
    const shapes = STUDIO_PAGES.find((p) => p.format === "regions")!;
    expect(shapes.premium).toBeFalsy();
    expect(shapes.regions!.length).toBeGreaterThan(5);
    expect(pagesForAge("child").some((p) => p.id === shapes.id)).toBe(true);
  });

  it("JPEG pages keep their image modes (no format, or image)", () => {
    for (const p of STUDIO_PAGES.filter((x) => x.format !== "regions")) {
      expect(p.regions).toBeUndefined();
      expect(p.source).toBeTruthy();
    }
  });
});

describe("freeform walls come from line art, not the colour image", () => {
  const withLine = STUDIO_PAGES.filter((p) => p.lineSource);

  it("each premium lineSource is the same entitlement-checked route (?kind=line)", () => {
    for (const p of withLine.filter((x) => x.premium)) expect(p.lineSource).toBe(`/api/page/${p.id}?kind=line`);
  });

  it("each free lineSource is an existing public line file, never the paint file", () => {
    for (const p of withLine.filter((x) => !x.premium)) {
      expect(p.lineSource, p.id).toMatch(/^\/pages\/.+-line\.jpg$|^\/pages\/sample-garden\.jpg$/);
      expect(existsSync(`public${p.lineSource}`), p.lineSource).toBe(true);
      expect(p.lineSource).not.toMatch(/-paint\./);
    }
  });

  it("every JPEG page whose colour image differs from its line art declares the line art", () => {
    for (const p of STUDIO_PAGES.filter((x) => x.format !== "regions" && /-paint\.jpg$|^\/api\/page\//.test(x.source))) {
      expect(p.lineSource, p.id).toBeTruthy();
    }
  });

  it("the Studio's freeform walls are loaded from lineSource", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync("src/components/Studio.tsx", "utf8");
    expect(text).toMatch(/wallSrc = uploadSrc \?\? page\?\.lineSource \?\? src/);
    expect(text).toMatch(/loadImage\(wallSrc\)/);
    expect(text).not.toMatch(/loadImage\(src\)/);
  });
});
