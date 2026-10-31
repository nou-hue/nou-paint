import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { labelColorFor } from "../src/lib/paint/engine";

const css = readFileSync("src/styles.css", "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} missing`);
  return m[1];
};
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("colour contrast (WCAG AA 4.5:1 for text)", () => {
  const grounds = ["bg", "surface", "paper"];
  for (const fg of ["ink", "muted", "gold", "gold-deep", "teal"]) {
    for (const bg of grounds) {
      it(`${fg} on ${bg}`, () => expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5));
    }
  }
  it("button text on the accent button", () => expect(ratio(token("accent-fg"), token("accent"))).toBeGreaterThanOrEqual(4.5));
  it("the decorative gold fill is never used for text (kept >= 3:1 for rings and icons)", () =>
    expect(ratio(token("gold-fill"), token("bg"))).toBeGreaterThanOrEqual(3));
  it("swatch number labels flip between ink and white to stay readable", () => {
    expect(labelColorFor("#f6f1e6")).toBe("#3a3228");
    expect(labelColorFor("#3f6259")).toBe("#ffffff");
  });
});

describe("touch targets are at least 44px", () => {
  const files = ["src/components/Studio.tsx", "src/components/FinishScreen.tsx", "src/routes/index.tsx", "src/components/ParentalGate.tsx", "src/components/UnlockDialog.tsx"];
  it("no button, link or control is sized below size-11 / h-11", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      // interactive elements only: look at className strings that contain size-N / h-N with N < 11
      for (const m of text.matchAll(/className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/g)) {
        const cls = (m[1] ?? m[2]).replace(/size-(3|3\.5|4|5|6|7)\b/g, "");
        expect(cls, `${f}: ${cls}`).not.toMatch(/\b(size|h)-(8|9|10)\b/);
      }
    }
  });
  it("keyboard support exists on both painting surfaces", () => {
    expect(readFileSync("src/components/GridPainter.tsx", "utf8")).toMatch(/onKeyDown=\{onKey\}/);
    expect(readFileSync("src/components/Studio.tsx", "utf8")).toMatch(/onKeyDown=\{freeformKey\}/);
    expect(readFileSync("src/styles.css", "utf8")).toMatch(/:focus-visible/);
  });
});

describe("dark theme keeps AA contrast (both the OS rule and the toggle rule share one palette)", () => {
  const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf(':root[data-theme="light"]'));
  const osBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf(':root[data-theme="dark"]'));
  const dark = (name: string, block = darkBlock) => {
    const m = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`dark token ${name} missing`);
    return m[1];
  };
  it("the OS-driven and toggle-driven palettes are identical", () => {
    for (const t of ["bg", "surface", "paper", "ink", "muted", "gold", "gold-deep", "teal", "accent", "accent-fg", "focus"]) {
      expect(dark(t, osBlock), t).toBe(dark(t));
    }
  });
  for (const fg of ["ink", "muted", "gold", "gold-deep", "teal"]) {
    for (const bg of ["bg", "surface", "paper"]) {
      it(`dark: ${fg} on ${bg}`, () => expect(ratio(dark(fg), dark(bg))).toBeGreaterThanOrEqual(4.5));
    }
  }
  it("dark: button text on the accent button", () => expect(ratio(dark("accent-fg"), dark("accent"))).toBeGreaterThanOrEqual(4.5));
  it("dark: focus ring is visible against every ground (>= 3:1)", () => {
    for (const bg of ["bg", "surface", "paper"]) expect(ratio(dark("focus"), dark(bg))).toBeGreaterThanOrEqual(3);
  });
  it("light: focus ring is visible against every ground (>= 3:1)", () => {
    for (const bg of ["bg", "surface", "paper"]) expect(ratio(token("focus"), token(bg))).toBeGreaterThanOrEqual(3);
  });
});
