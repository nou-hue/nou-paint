import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cookieSecretConfigured,
  isProductionRuntime,
  signToken,
  signingAvailable,
  verifyToken,
} from "../src/lib/pay/signing.server";

beforeEach(() => vi.stubEnv("ENTITLEMENT_COOKIE_SECRET", "x".repeat(40)));
afterEach(() => vi.unstubAllEnvs());

describe("signed tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = signToken({ cid: "cus_1", exp: Math.floor(Date.now() / 1000) + 60 });
    expect(verifyToken(t)?.cid).toBe("cus_1");
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ cid: "cus_evil", exp: 9_999_999_999 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyToken(`${body}.AAAA`)).toBeNull();
    expect(verifyToken("garbage")).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
  });

  it("expires, unless the caller explicitly allows a stale token", () => {
    const t = signToken({ cid: "c", exp: 1000 });
    expect(verifyToken(t, { now: 2000 })).toBeNull();
    expect(verifyToken(t, { now: 2000, allowExpired: true })?.cid).toBe("c");
  });

  it("a token signed with another secret does not verify", () => {
    const t = signToken({ cid: "c" });
    vi.stubEnv("ENTITLEMENT_COOKIE_SECRET", "y".repeat(40));
    expect(verifyToken(t)).toBeNull();
  });

  it("fails closed in production without a secret, but not in preview", () => {
    expect(cookieSecretConfigured({ ENTITLEMENT_COOKIE_SECRET: "short" })).toBe(false);
    expect(signingAvailable({ VERCEL_ENV: "production" })).toBe(false);
    expect(signingAvailable({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(signingAvailable({ VERCEL_ENV: "production", ENTITLEMENT_COOKIE_SECRET: "z".repeat(32) })).toBe(true);
  });
});
