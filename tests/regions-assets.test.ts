import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_PAGES } from "../src/lib/paint/catalog";

const walk = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

describe("the Chahar Bagh draft is a test fixture only", () => {
  it("lives under tests/fixtures", () => {
    expect(existsSync("tests/fixtures/chahar-bagh-DRAFT.svg")).toBe(true);
    expect(readFileSync("tests/fixtures/chahar-bagh-DRAFT.svg", "utf8")).toContain("DRAFT SAMPLE");
  });

  it("is not in public/, private/ or src/ (no copy by any name)", () => {
    const fixtureBytes = readFileSync("tests/fixtures/chahar-bagh-DRAFT.svg");
    for (const f of [...walk("public"), ...walk("private"), ...walk("src")]) {
      expect(f, f).not.toMatch(/chahar/i);
      if (/\.svg$/i.test(f)) expect(readFileSync(f).equals(fixtureBytes), f).toBe(false);
    }
  });

  it("is not named, imported or referenced from application code", () => {
    for (const f of walk("src").filter((x) => /\.(tsx?|css)$/.test(x))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/chahar|tests\/fixtures/i);
    }
    for (const t of ["package.json", "vite.config.ts"]) expect(readFileSync(t, "utf8")).not.toMatch(/chahar/i);
  });

  it("no premium SVG is served as a public file; the catalog does not list one", () => {
    expect(walk("public").filter((f) => /\.svg$/i.test(f) && /pages/.test(f))).toEqual([]);
    expect(walk("private/pages").filter((f) => /\.svg$/i.test(f))).toEqual([]);
    for (const p of STUDIO_PAGES.filter((x) => x.premium)) {
      expect(p.source).toBe(`/api/page/${p.id}`);
      expect(p.art).not.toMatch(/\.svg/);
    }
  });

  it("a premium regions page can never carry its regions in the client bundle", () => {
    for (const p of STUDIO_PAGES.filter((x) => x.premium)) expect((p as { regions?: unknown }).regions).toBeUndefined();
  });
});

describe("the built output (when a build exists)", () => {
  const out = existsSync(".vercel/output") ? ".vercel/output" : null;
  it.skipIf(!out)("holds no copy of the fixture, and no region file under the static (public) tree", () => {
    const stat = walk(".vercel/output/static");
    expect(stat.filter((f) => /\.svg$/i.test(f) && /pages\//.test(f))).toEqual([]);
    for (const f of stat.filter((x) => /\.(js|html|svg|json|css)$/.test(x))) {
      expect(readFileSync(f, "utf8"), f).not.toContain("DRAFT SAMPLE");
    }
  });
});
