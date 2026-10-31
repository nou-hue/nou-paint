import { describe, expect, it } from "vitest";
import { assertTestKey, paymentsConfigured, siteUrl, StripeNotConfiguredError } from "../src/lib/pay/stripe.server";

describe("test-mode guard", () => {
  it("accepts test keys", () => {
    expect(assertTestKey("sk_test_abc123")).toBe("sk_test_abc123");
    expect(assertTestKey("rk_test_abc123")).toBe("rk_test_abc123");
  });

  it("refuses live keys unless ALLOW_LIVE_STRIPE=1 (go-live is a separate step)", () => {
    expect(() => assertTestKey("sk_live_abc123", {})).toThrow(StripeNotConfiguredError);
    expect(() => assertTestKey("rk_live_abc123", { ALLOW_LIVE_STRIPE: "0" })).toThrow(StripeNotConfiguredError);
    expect(assertTestKey("sk_live_abc123", { ALLOW_LIVE_STRIPE: "1" })).toBe("sk_live_abc123");
  });

  it("refuses missing or malformed keys", () => {
    expect(() => assertTestKey(undefined)).toThrow(StripeNotConfiguredError);
    expect(() => assertTestKey("pk_test_abc")).toThrow(StripeNotConfiguredError);
  });

  it("degrades gracefully: no keys or a live key means payments are simply off", () => {
    expect(paymentsConfigured({})).toBe(false);
    expect(paymentsConfigured({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false); // no price yet
    expect(paymentsConfigured({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PRICE_ID: "price_1" })).toBe(false);
    expect(paymentsConfigured({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_ID: "price_1" })).toBe(true);
  });

  it("builds the site URL from SITE_URL, then VERCEL_URL, then the request origin", () => {
    expect(siteUrl("http://x", { SITE_URL: "https://a.example/" })).toBe("https://a.example");
    expect(siteUrl("http://x", { VERCEL_URL: "p.vercel.app" })).toBe("https://p.vercel.app");
    expect(siteUrl("http://x", {})).toBe("http://x");
  });
});
