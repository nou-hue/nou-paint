/**
 * Best-effort in-memory limiter (fixed window).
 *
 * LIMITATION (by design: no new database): serverless instances do not share
 * memory, so limits are per warm instance. They stop casual abuse and bursts,
 * not a distributed attacker.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

export type LimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

/** Count one hit against `key`. Returns allowed=false once over `limit` in `windowMs`. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): LimitResult {
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { allowed: true, remaining: limit - b.count, retryAfterSec: 0 };
}

export function _resetForTests() {
  buckets.clear();
}

/** Client IP as seen by Vercel's edge (x-forwarded-for is set by the platform). Used only for in-memory rate limiting, never stored. */
export function clientIp(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}
