import Stripe from "stripe";
import { isPackId, type PackId } from "../paint/catalog";

/** Pinned Stripe API version (matches the installed SDK's types). */
export const STRIPE_API_VERSION = "2026-09-30.endive" as const;

/** Marker put on every Checkout Session / charge we own. */
export const PRODUCT_KEY = "nou_paint_pack";

export class StripeNotConfiguredError extends Error {
  constructor(msg = "Stripe is not configured") {
    super(msg);
    this.name = "StripeNotConfiguredError";
  }
}

/**
 * TEST MODE ONLY. A live key refuses to run unless ALLOW_LIVE_STRIPE=1 is set
 * explicitly (go-live is a separate, user-approved step).
 */
export function assertTestKey(key: string | undefined, env: Record<string, string | undefined> = process.env): string {
  if (!key) throw new StripeNotConfiguredError("STRIPE_SECRET_KEY is not set");
  if (/^(sk|rk)_live_/.test(key) && env.ALLOW_LIVE_STRIPE !== "1") {
    throw new StripeNotConfiguredError("Refusing to use a live Stripe key (ALLOW_LIVE_STRIPE is not 1)");
  }
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    throw new StripeNotConfiguredError("STRIPE_SECRET_KEY has an unexpected format");
  }
  return key;
}

let client: Stripe | null = null;
let clientKey: string | null = null;

export function getStripe(): Stripe {
  const key = assertTestKey(process.env.STRIPE_SECRET_KEY);
  if (!client || clientKey !== key) {
    client = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, appInfo: { name: "nou-paint" } });
    clientKey = key;
  }
  return client;
}

/** Price id for a pack. Only one placeholder test Price exists today (STRIPE_PRICE_ID). */
export function priceIdFor(_pack: PackId, env: Record<string, string | undefined> = process.env): string | undefined {
  return env.STRIPE_PRICE_ID?.trim() || undefined;
}

/** Everything needed to take a payment. False => the UI shows "not available yet". */
export function paymentsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try {
    assertTestKey(env.STRIPE_SECRET_KEY, env);
  } catch {
    return false;
  }
  return Boolean(env.STRIPE_PRICE_ID?.trim());
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET) && paymentsConfigured();
}

export function siteUrl(requestOrigin?: string, env: Record<string, string | undefined> = process.env): string {
  const explicit = env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return requestOrigin ?? "http://localhost:8080";
}

/** Same-origin check for state-changing POSTs (defence in depth on top of SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers (curl); webhooks do not use these routes
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return o.host === host;
  } catch {
    return false;
  }
}

export function packOfSession(s: { metadata?: Record<string, string> | null }): PackId | null {
  const p = s.metadata?.np_pack;
  return isPackId(p) ? p : null;
}

/** Price shown in the UI, always read from Stripe (cached briefly). */
let priceCache: { id: string; at: number; value: { display: string; ok: boolean } } | null = null;

export async function getPriceDisplay(pack: PackId): Promise<{ display: string; ok: boolean } | null> {
  if (!paymentsConfigured()) return null;
  const id = priceIdFor(pack) as string;
  if (priceCache && priceCache.id === id && Date.now() - priceCache.at < 5 * 60_000) return priceCache.value;
  try {
    const price = await getStripe().prices.retrieve(id);
    const ok = Boolean(price.active) && price.type === "one_time" && price.unit_amount != null;
    const display =
      price.unit_amount != null
        ? new Intl.NumberFormat("en-GB", { style: "currency", currency: price.currency.toUpperCase() }).format(
            price.unit_amount / 100,
          )
        : "";
    const value = { display, ok };
    priceCache = { id, at: Date.now(), value };
    return value;
  } catch (e) {
    console.error("[nou-paint] price lookup failed", (e as Error)?.message);
    return null;
  }
}
