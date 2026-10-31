import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "../src/lib/motion";

const css = readFileSync("src/styles.css", "utf8");

describe("prefersReducedMotion()", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is false with no window (server render) or no matchMedia", () => {
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(false);
  });
  it("follows the media query", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });
  it("survives matchMedia throwing", () => {
    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("nope");
      },
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("reduced-motion CSS guard", () => {
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  it("switches off every animation and transition and the press / lift transforms", () => {
    expect(block).toMatch(/animation:\s*none\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/scroll-behavior:\s*auto\s*!important/);
    expect(block).toMatch(/\.press:active[^{]*[\s\S]*transform:\s*none\s*!important/);
  });
});

describe("motion uses compositor properties only (transform and opacity)", () => {
  it("every @keyframes animates only transform and opacity", () => {
    const frames = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(8);
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "opacity"], `@keyframes ${name}: ${p}`).toContain(p);
    }
  });
  it("every transition-property is transform and/or opacity", () => {
    for (const m of css.matchAll(/(?<![-\w])transition:\s*([^;]+);/g)) {
      const props = m[1].split(",").map((part) => part.trim().split(/\s+/)[0]);
      for (const p of props) expect(["transform", "opacity"], m[0]).toContain(p);
    }
  });
});
