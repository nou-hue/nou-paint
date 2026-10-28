import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Cookie jar for the TanStack request context, replaced by a plain map in tests.
const jar = new Map<string, string>();
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (n: string) => jar.get(n),
  setCookie: (n: string, v: string) => void jar.set(n, v),
  deleteCookie: (n: string) => void jar.delete(n),
}));

import { Route as PageRoute } from "../src/routes/api/page.$pageId";
import { Route as CheckoutRoute } from "../src/routes/api/checkout";
import { Route as WebhookRoute } from "../src/routes/api/stripe.webhook";
import { Route as RestoreRoute } from "../src/routes/api/restore";
import { makeEntitlementToken, ENT_COOKIE } from "../src/lib/pay/entitlement-server";

type Handler = (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>;
const handlers = (r: unknown) => (r as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:8080/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jar.clear();
  vi.stubEnv("ENTITLEMENT_COOKIE_SECRET", "t".repeat(40));
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("STRIPE_PRICE_ID", "");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
});

describe("GET /api/page/:id (premium images are server-gated)", () => {
  const get = (id: string) =>
    handlers(PageRoute).GET({ request: new Request(`http://localhost/api/page/${id}`), params: { pageId: id } });

  it("refuses a premium page with no entitlement (403, never cacheable)", async () => {
    const r = await get("simorgh");
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("content-type")).toContain("json");
  });

  it("refuses a forged or tampered cookie", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]) + "x");
    expect((await get("garden")).status).toBe(403);
    jar.set(ENT_COOKIE, "bm90LWEtdG9rZW4.AAAA");
    expect((await get("garden")).status).toBe(403);
  });

  it("serves the real image bytes to a valid entitlement", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]));
    const r = await get("simorgh");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toContain("no-store");
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes.equals(readFileSync("private/pages/simorgh-paint.jpg"))).toBe(true);
  });

  it("an entitlement for another pack does not unlock this one", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", []));
    expect((await get("simorgh")).status).toBe(403);
  });

  it("an expired cookie does not unlock (Stripe is the source of truth, and is off here)", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"], Math.floor(Date.now() / 1000) - 3600));
    expect((await get("simorgh")).status).toBe(403);
  });

  it("is not a way to read free pages or arbitrary files", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]));
    for (const id of ["nightingale", "sample", "nope", "../package", "simorgh-line", "..%2F..%2Fetc%2Fpasswd", ""]) {
      expect((await get(id)).status, id).toBe(404);
    }
  });
});

describe("POST /api/checkout (consent enforced on the server)", () => {
  const run = (body: unknown, headers?: Record<string, string>) => handlers(CheckoutRoute).POST({ request: post(body, headers) });

  it("rejects a missing or false consent", async () => {
    expect((await run({ packId: "dreamy-test", waiverVersion: "v1" })).status).toBe(400);
    expect((await run({ consent: false, packId: "dreamy-test", waiverVersion: "v1" })).status).toBe(400);
    expect((await run({ consent: "true", packId: "dreamy-test", waiverVersion: "v1" })).status).toBe(400);
    const r = await run({ packId: "dreamy-test", waiverVersion: "v1" });
    expect(await r.json()).toEqual({ error: "consent_required" });
  });

  it("rejects an out-of-date waiver version and unknown packs", async () => {
    expect((await run({ consent: true, waiverVersion: "v0", packId: "dreamy-test" })).status).toBe(409);
    expect((await run({ consent: true, waiverVersion: "v1", packId: "not-a-pack" })).status).toBe(400);
  });

  it("rejects cross-origin posts", async () => {
    const r = await run({ consent: true, waiverVersion: "v1", packId: "dreamy-test" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });

  it("degrades to 503 with no Stripe keys, and still never throws", async () => {
    const r = await run({ consent: true, waiverVersion: "v1", packId: "dreamy-test" });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "payments_not_configured" });
  });

  it("refuses to start a checkout with a live key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_not_a_real_key");
    vi.stubEnv("STRIPE_PRICE_ID", "price_1");
    expect((await run({ consent: true, waiverVersion: "v1", packId: "dreamy-test" })).status).toBe(503);
  });
});

describe("other payment routes without keys", () => {
  it("webhook answers 503 when not configured and 400 never reaches processing", async () => {
    const r = await handlers(WebhookRoute).POST({ request: new Request("http://x/api/stripe/webhook", { method: "POST", body: "{}" }) });
    expect(r.status).toBe(503);
  });

  it("webhook rejects a missing or bad signature when configured (test key + secret)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PRICE_ID", "price_1");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
    const noSig = await handlers(WebhookRoute).POST({ request: new Request("http://x/api/stripe/webhook", { method: "POST", body: "{}" }) });
    expect(noSig.status).toBe(400);
    const bad = await handlers(WebhookRoute).POST({
      request: new Request("http://x/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=bad" } }),
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "bad_signature" });
  });

  it("restore answers 503 when email or Stripe is not configured", async () => {
    const r = await handlers(RestoreRoute).POST({
      request: new Request("http://x/api/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "a@b.co" }) }),
    });
    expect(r.status).toBe(503);
  });
});
