import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_COLOR, THEME_INIT_SCRIPT, THEME_KEY, resolveTheme } from "../src/lib/theme";

describe("theme resolution", () => {
  it("an explicit choice wins over the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("with nothing stored it follows the system", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
    expect(resolveTheme("garbage", true)).toBe("dark");
  });
  it("the no-flash script only reads one local key and sets one attribute", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_KEY);
    expect(THEME_INIT_SCRIPT).toContain("data-theme");
    expect(THEME_INIT_SCRIPT).not.toMatch(/fetch|XMLHttp|http/);
  });
  it("browser chrome colours match the page background tokens", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain(`--color-bg: ${THEME_COLOR.light}`);
    expect(css).toContain(`--color-bg: ${THEME_COLOR.dark}`);
  });
});
