import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tiny HMAC-signed token helper (no JWT dependency).
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Payloads carry their own `exp` (unix seconds) when expiry matters.
 */

let ephemeral: string | null = null;

export function cookieSecretConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ENTITLEMENT_COOKIE_SECRET && env.ENTITLEMENT_COOKIE_SECRET.length >= 32);
}

/** True when this process is a real production deployment (fail closed there). */
export function isProductionRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" || (!env.VERCEL_ENV && env.NODE_ENV === "production");
}

/**
 * Production fails closed when the secret is missing (see signingAvailable).
 * Preview/dev fall back to a per-process random secret so the app still runs;
 * cookies then simply stop validating when the instance restarts.
 */
export function signingAvailable(env: Record<string, string | undefined> = process.env): boolean {
  if (cookieSecretConfigured(env)) return true;
  return !isProductionRuntime(env);
}

function secret(): string {
  if (cookieSecretConfigured()) return process.env.ENTITLEMENT_COOKIE_SECRET as string;
  if (!ephemeral) {
    ephemeral = randomBytes(32).toString("hex");
    console.warn("[nou-paint] ENTITLEMENT_COOKIE_SECRET missing or < 32 chars: using an ephemeral secret (not for production).");
  }
  return ephemeral;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function mac(body: string): Buffer {
  return createHmac("sha256", secret()).update(body).digest();
}

export function signToken(payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(mac(body))}`;
}

/** Returns the payload if the signature is valid and (when present) `exp` is in the future. */
export function verifyToken<T extends Record<string, unknown>>(
  token: string | undefined | null,
  opts: { allowExpired?: boolean; now?: number } = {},
): T | null {
  if (!token || typeof token !== "string") return null;
  const i = token.indexOf(".");
  if (i < 1) return null;
  const body = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1), "base64url");
  const expected = mac(body);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (!opts.allowExpired && typeof payload.exp === "number" && payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
