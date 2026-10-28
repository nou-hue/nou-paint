import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const src = walk("src").filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith("routeTree.gen.ts"));
const read = (f: string) => readFileSync(f, "utf8");

describe("kids mode collects nothing and calls nobody", () => {
  it("no source file loads from a third-party host (fonts, scripts, analytics)", () => {
    const banned = /(grok\.com|googleapis|gstatic|google-analytics|googletagmanager|facebook|doubleclick|segment\.(io|com)|mixpanel|amplitude\.com|sentry\.io|hotjar|cloudfront|cdn\.)/i;
    for (const f of src) expect(read(f), f).not.toMatch(banned);
  });

  it("the only https URLs in client code are the ICO link and the Stripe host check", () => {
    const allowed = new Set(["https://ico.org.uk/make-a-complaint/", "https://api.resend.com/emails"]);
    for (const f of src) {
      for (const m of read(f).match(/https?:\/\/[^\s"'`)<>]+/g) ?? []) {
        if (/localhost|example|w3\.org|\$\{/.test(m)) continue;
        expect(allowed.has(m), `${f}: ${m}`).toBe(true);
      }
    }
  });

  it("the Resend call is server-only", () => {
    for (const f of src.filter((x) => read(x).includes("api.resend.com"))) expect(f).toMatch(/\.server\.ts$/);
  });

  it("no sign-in, auth, analytics or tracking code remains", () => {
    for (const f of src) {
      expect(read(f), f).not.toMatch(/better-auth|AuthProvider|AuthSlot|signIn|useCurrentUser|PreviewHostBridge|__grok|navigator\.sendBeacon/);
    }
    expect(() => readFileSync("src/routes/login.tsx")).toThrow();
  });

  it("the fake localStorage unlock is gone", () => {
    for (const f of src) {
      expect(read(f), f).not.toMatch(/unlockAdult|£1\.99/);
      // the store may only mention the old key to DROP it in its migration
      if (!f.endsWith("paint/store.ts")) expect(read(f), f).not.toMatch(/adultUnlocked/);
    }
    expect(read("src/lib/paint/store.ts")).not.toMatch(/adultUnlocked:\s*(false|true)/);
  });

  it("the build policy is self-only (CSP has no external origin) and sends no referrer", () => {
    const cfg = read("vite.config.ts");
    const csp = cfg.slice(cfg.indexOf("const CSP"), cfg.indexOf("].join"));
    expect(csp).not.toMatch(/https?:/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(cfg).toMatch(/no-referrer/);
  });

  it("fonts are self-hosted npm packages", () => {
    const css = read("src/styles.css");
    expect(css).toMatch(/@import "@fontsource\//);
    expect(css).not.toMatch(/url\(["']?https?:/);
  });

  it("the old scaffold script and manifest are gone", () => {
    expect(() => readFileSync("public/__grok/pwa.js")).toThrow();
    expect(read("public/manifest.webmanifest")).toContain('"name": "Nou Paint"');
  });

  it("the committed preview client secret module is gone", () => {
    expect(() => readFileSync("src/lib/auth/preview.ts")).toThrow();
  });
});
