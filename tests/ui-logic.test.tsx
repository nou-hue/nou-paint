import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAnswer, makeChallenge } from "../src/lib/gate";
import { paintedPercent } from "../src/lib/paint/engine";
import { draftBuild } from "../vite.draft";
import { isStripeCheckoutUrl, type EntitlementInfo } from "../src/lib/pay/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("parental gate logic", () => {
  it("makes a sum a small child is unlikely to know, and accepts only the exact digits", () => {
    for (let i = 0; i < 50; i++) {
      const c = makeChallenge();
      expect(c.answer).toBeGreaterThanOrEqual(36 + 11);
      expect(checkAnswer(c, String(c.answer))).toBe(true);
      expect(checkAnswer(c, ` ${c.answer} `)).toBe(true);
      expect(checkAnswer(c, String(c.answer + 1))).toBe(false);
      expect(checkAnswer(c, "")).toBe(false);
      expect(checkAnswer(c, `${c.answer}abc`)).toBe(false);
      expect(checkAnswer(c, "0x10")).toBe(false);
    }
  });

  it("is deterministic for a given random source and changes between asks", () => {
    expect(makeChallenge(() => 0)).toEqual({ question: "What is 6 × 6 + 11?", answer: 47 });
    const a = new Set(Array.from({ length: 40 }, () => makeChallenge().question));
    expect(a.size).toBeGreaterThan(5);
  });
});

describe("purchase UI", () => {
  const info: EntitlementInfo = {
    packs: [],
    pack: { id: "dreamy-test", title: "Dreamy test pack" },
    payments: true,
    price: { display: "£4.99" },
    restore: true,
    summary: { features: "[PACK CONTENTS]", duration: "[PRODUCT DURATION]", total: "£4.99 [VAT STATEMENT]" },
  };

  it("the unlock dialog opens on the parental gate, with no purchase controls visible", async () => {
    const { UnlockDialog } = await import("../src/components/UnlockDialog");
    const html = renderToStaticMarkup(<UnlockDialog onClose={() => {}} />);
    expect(html).toContain("Grown-ups only");
    expect(html).not.toMatch(/Pay now|type="checkbox"|Restore a purchase/);
  });

  it("the waiver checkbox starts unticked, the pay button is disabled and says Pay now", async () => {
    const { PurchasePanel } = await import("../src/components/UnlockDialog");
    const html = renderToStaticMarkup(<PurchasePanel initialInfo={info} onClose={() => {}} />);
    const box = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? "";
    expect(box).toBeTruthy();
    expect(box).not.toMatch(/checked/);
    const btn = html.match(/<button[^>]*>Pay now £4\.99<\/button>/)?.[0] ?? "";
    expect(btn).toMatch(/disabled/);
    expect(html).toContain("lose my 14-day right to cancel");
    expect(html).toContain("Total price");
    expect(html).toContain("£4.99 [VAT STATEMENT]");
    expect(html).toContain("Restore a purchase");
  });

  it("without payments configured there is no way to pay", async () => {
    const { PurchasePanel } = await import("../src/components/UnlockDialog");
    const html = renderToStaticMarkup(<PurchasePanel initialInfo={{ ...info, payments: false, price: null, restore: false }} onClose={() => {}} />);
    expect(html).toContain("Buying is not available yet");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Pay now/);
  });

  it("only ever sends the browser to Stripe's own checkout host", () => {
    expect(isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_x")).toBe(true);
    expect(isStripeCheckoutUrl("https://checkout.stripe.com.evil.example/x")).toBe(false);
    expect(isStripeCheckoutUrl("http://checkout.stripe.com/x")).toBe(false);
    expect(isStripeCheckoutUrl("javascript:alert(1)")).toBe(false);
  });

  it("external links render as gated buttons, never as real anchors", async () => {
    const { ExternalLink } = await import("../src/components/ExternalLink");
    const html = renderToStaticMarkup(<ExternalLink href="https://ico.org.uk/">ICO</ExternalLink>);
    expect(html).toMatch(/^<button/);
    expect(html).not.toMatch(/<a /);
    expect(html).not.toMatch(/ href=/);
  });
});

describe("Draft banner and noindex", () => {
  it("shows on preview/dev builds", async () => {
    vi.stubEnv("VITE_DRAFT_BUILD", "1");
    const { DraftBanner } = await import("../src/components/DraftBanner");
    expect(renderToStaticMarkup(<DraftBanner />)).toContain("Draft");
  });

  it("never renders in a production build", async () => {
    vi.stubEnv("VITE_DRAFT_BUILD", "0");
    const { DraftBanner } = await import("../src/components/DraftBanner");
    expect(renderToStaticMarkup(<DraftBanner />)).toBe("");
  });

  it("the build flag follows Vercel's environment", () => {
    expect(draftBuild("build", "production", { VERCEL_ENV: "preview" })).toBe(true);
    expect(draftBuild("build", "production", { VERCEL_ENV: "production" })).toBe(false);
    expect(draftBuild("serve", "development", {})).toBe(true);
    expect(draftBuild("build", "production", {})).toBe(false);
  });

  it("/privacy and /terms are always noindex", async () => {
    const { Route: privacy } = await import("../src/routes/privacy");
    const { Route: terms } = await import("../src/routes/terms");
    for (const r of [privacy, terms]) {
      const head = (r as unknown as { options: { head: () => { meta: Record<string, string>[] } } }).options.head();
      expect(head.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    }
  });

  it("the root adds noindex on draft builds", async () => {
    vi.stubEnv("VITE_DRAFT_BUILD", "1");
    const { Route } = await import("../src/routes/__root");
    const head = (Route as unknown as { options: { head: () => { meta: Record<string, string>[]; links: Record<string, string>[] } } }).options.head();
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(head.links.find((l) => l.rel === "manifest")?.href).toBe("/manifest.webmanifest");
    expect(JSON.stringify(head)).not.toMatch(/fonts\.googleapis|grok\.com/);
  });
});

describe("freeform progress", () => {
  const px = (...cells: ("ink" | "open" | "paint")[]) => {
    const walls = new Uint8ClampedArray(cells.length * 4);
    const paint = new Uint8ClampedArray(cells.length * 4);
    cells.forEach((c, i) => {
      const v = c === "ink" ? 0 : 255;
      walls.set([v, v, v, 255], i * 4);
      if (c === "paint") paint.set([200, 100, 100, 255], i * 4);
    });
    return { walls: { data: walls }, paint: { data: paint } };
  };

  it("counts only paintable (non-outline) pixels", () => {
    const a = px("ink", "open", "open", "open", "open");
    expect(paintedPercent(a.paint, a.walls)).toBe(0);
    const b = px("ink", "paint", "open", "open", "open");
    expect(paintedPercent(b.paint, b.walls)).toBe(25);
    const c = px("ink", "paint", "paint", "paint", "paint");
    expect(paintedPercent(c.paint, c.walls)).toBe(100);
  });
});

describe("store migration", () => {
  it("drops the old fake unlock flag from saved state", async () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const { useAppStore } = await import("../src/lib/paint/store");
    const opts = useAppStore.persist.getOptions();
    const migrated = (opts.migrate as (p: unknown, v: number) => Record<string, unknown>)({ age: "adult", adultUnlocked: true }, 1);
    expect(migrated).toEqual({ age: "adult" });
    expect(opts.version).toBe(2);
  });
});
