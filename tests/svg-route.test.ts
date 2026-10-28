import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (n: string) => jar.get(n),
  setCookie: (n: string, v: string) => void jar.set(n, v),
  deleteCookie: (n: string) => void jar.delete(n),
}));

// TEST FIXTURE ONLY. No premium SVG ships; the route is exercised with a stand-in loader.
const fixture = readFileSync("tests/fixtures/chahar-bagh-DRAFT.svg", "utf8");
const loadPremiumSvg = vi.fn(async (id: string) => (id === "fixturepage" ? fixture : null));
vi.mock("@/lib/premium-assets.server", () => ({
  loadPremiumSvg: (id: string) => loadPremiumSvg(id),
  loadPremiumImage: async () => null,
}));

vi.mock("@/lib/paint/catalog", async (orig) => {
  const real = await orig<typeof import("../src/lib/paint/catalog")>();
  const page = {
    id: "fixturepage",
    title: "Fixture",
    audience: "adult" as const,
    difficulty: "intricate" as const,
    premium: true,
    packId: "dreamy-test",
    format: "regions" as const,
    art: "",
    source: "/api/page/fixturepage",
    colors: 8,
    grid: 0,
  };
  const pages = [...real.STUDIO_PAGES, page];
  return {
    ...real,
    STUDIO_PAGES: pages,
    pageById: (id: string) => pages.find((p) => p.id === id),
    packForPage: (id: string) => (id === "fixturepage" ? "dreamy-test" : real.packForPage(id)),
  };
});

import { Route } from "../src/routes/api/page.$pageId";
import { makeEntitlementToken, ENT_COOKIE } from "../src/lib/pay/entitlement-server";
import { parseRegionSvg } from "../src/lib/paint/regions";

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const GET = (Route as unknown as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET;
const get = (id: string, qs = "") => GET({ request: new Request(`http://localhost/api/page/${id}${qs}`), params: { pageId: id } });

beforeEach(() => {
  jar.clear();
  loadPremiumSvg.mockClear();
  vi.stubEnv("ENTITLEMENT_COOKIE_SECRET", "t".repeat(40));
  vi.stubEnv("STRIPE_SECRET_KEY", "");
});

describe("GET /api/page/:id for a premium SVG region page", () => {
  it("is locked (403, no-store) without an entitlement, and never even reads the file", async () => {
    const r = await get("fixturepage");
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("content-type")).toContain("json");
    expect(await r.text()).not.toContain("<svg");
    expect(loadPremiumSvg).not.toHaveBeenCalled();
  });

  it("is locked for a forged cookie and for another pack", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]) + "x");
    expect((await get("fixturepage")).status).toBe(403);
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", []));
    expect((await get("fixturepage")).status).toBe(403);
    expect(loadPremiumSvg).not.toHaveBeenCalled();
  });

  it("serves the SVG to an entitled visitor: no-store, sandboxed, not sniffable", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]));
    const r = await get("fixturepage");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/svg+xml");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("cache-control")).toContain("private");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
    const body = await r.text();
    expect(body).toBe(fixture);
    const parsed = parseRegionSvg(body);
    expect(parsed.ok && parsed.regions.length).toBe(80);
  });

  it("ignores ?kind for SVG pages (there is one file)", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]));
    const r = await get("fixturepage", "?kind=line");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(fixture);
  });

  it("404s when the pack is paid for but the file is missing", async () => {
    loadPremiumSvg.mockResolvedValueOnce(null);
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]));
    const r = await get("fixturepage");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("free region pages are never served by this route", async () => {
    jar.set(ENT_COOKIE, makeEntitlementToken("cus_1", ["dreamy-test"]));
    expect((await get("shapes")).status).toBe(404);
  });
});
