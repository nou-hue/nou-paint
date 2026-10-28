import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { randomId, signToken, verifyToken, signingAvailable } from "./signing.server";
import { getStripe, paymentsConfigured } from "./stripe.server";
import { packsForCustomer } from "./entitlement-store.server";
import { packForPage } from "../paint/catalog";
import type { PackId } from "../paint/catalog";

/**
 * Entitlement cookie (`np_ent`) is a signed, SHORT-LIVED (10 min) token naming a
 * Stripe customer. It is a cache, not the source of truth: when it goes stale
 * the server re-checks Stripe, so a refund or dispute stops access within
 * the TTL. The device cookie (`np_dev`) binds a Checkout Session to the
 * browser that started it.
 */
export const ENT_TTL_SEC = 10 * 60;
export const ENT_COOKIE = "np_ent";
export const DEV_COOKIE = "np_dev";
const LONG_MAX_AGE = 60 * 60 * 24 * 365;

export type EntPayload = { cid: string; packs: PackId[]; iat: number; exp: number };
export type DevPayload = { id: string };

/** Minimal cookie jar so tests can run without a request context. */
export type Jar = {
  get(name: string): string | undefined;
  set(name: string, value: string, opts: Record<string, unknown>): void;
  delete(name: string): void;
};

export const requestJar: Jar = {
  get: (n) => getCookie(n),
  set: (n, v, o) => setCookie(n, v, o),
  delete: (n) => deleteCookie(n, { path: "/" }),
};

const baseCookie = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/* ------------------------------ device cookie ------------------------------ */

export function readDevice(jar: Jar = requestJar): DevPayload {
  const p = verifyToken<DevPayload>(jar.get(DEV_COOKIE), { allowExpired: true });
  if (p && typeof p.id === "string" && p.id.length >= 8) return p;
  return { id: randomId(12) };
}

export function writeDevice(d: DevPayload, jar: Jar = requestJar): void {
  jar.set(DEV_COOKIE, signToken({ id: d.id }), { ...baseCookie(), maxAge: LONG_MAX_AGE });
}

/* ---------------------------- entitlement cookie ---------------------------- */

export function makeEntitlementToken(customerId: string, packs: PackId[], now = Math.floor(Date.now() / 1000)): string {
  return signToken({ cid: customerId, packs, iat: now, exp: now + ENT_TTL_SEC } satisfies EntPayload);
}

export function setEntitlementCookie(customerId: string, packs: PackId[], jar: Jar = requestJar): void {
  jar.set(ENT_COOKIE, makeEntitlementToken(customerId, packs), { ...baseCookie(), maxAge: LONG_MAX_AGE });
}

export function clearEntitlementCookie(jar: Jar = requestJar): void {
  jar.delete(ENT_COOKIE);
}

/**
 * Which packs this request may use.
 *  - valid, unexpired signed cookie    -> its packs (no Stripe call)
 *  - signed but stale cookie           -> re-check Stripe, refresh or clear the cookie
 *  - no/invalid cookie, Stripe down    -> none (fail closed)
 */
export async function entitledPacks(jar: Jar = requestJar): Promise<PackId[]> {
  const raw = jar.get(ENT_COOKIE);
  const fresh = verifyToken<EntPayload>(raw);
  if (fresh?.cid && Array.isArray(fresh.packs)) return fresh.packs;

  const stale = verifyToken<EntPayload>(raw, { allowExpired: true });
  if (!stale?.cid) return [];
  if (!paymentsConfigured() || !signingAvailable()) return [];
  try {
    const packs = await packsForCustomer(getStripe(), stale.cid);
    if (packs.length) setEntitlementCookie(stale.cid, packs, jar);
    else clearEntitlementCookie(jar);
    return packs;
  } catch (e) {
    console.error("[nou-paint] entitlement re-check failed", (e as Error)?.message);
    return [];
  }
}

/** True when this request may receive the premium page `pageId`. Free pages are never gated here. */
export async function mayViewPage(pageId: string, jar: Jar = requestJar): Promise<boolean> {
  const pack = packForPage(pageId);
  if (!pack) return false; // not a premium page: this route does not serve it
  return (await entitledPacks(jar)).includes(pack);
}
