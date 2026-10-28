import { createFileRoute } from "@tanstack/react-router";
import { setEntitlementCookie } from "@/lib/pay/entitlement-server";
import { packsForCustomer } from "@/lib/pay/entitlement-store.server";
import { signingAvailable, verifyToken } from "@/lib/pay/signing.server";
import { getStripe, paymentsConfigured, sameOrigin } from "@/lib/pay/stripe.server";
import { hit } from "@/lib/pay/rate-limit.server";
import { ipOf, json, readJson } from "@/lib/pay/http.server";

type RestorePayload = { p: string; cid: string; nonce: string; exp: number };

/**
 * Redeem an emailed restore link (POST so mail scanners that prefetch GETs
 * cannot burn it). One-time: the nonce lives in the Stripe customer metadata
 * and is cleared on success. Expired (30 min), reused or tampered -> 400.
 */
export const Route = createFileRoute("/api/restore-redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ error: "bad_origin" }, 403);
        if (!paymentsConfigured() || !signingAvailable()) return json({ error: "restore_not_configured" }, 503);
        if (!hit(`redeem:${ipOf(request)}`, 10, 10 * 60_000).allowed) return json({ error: "rate_limited" }, 429);
        const body = await readJson<{ token: unknown }>(request);
        const token = typeof body.token === "string" ? body.token : "";
        const fail = () => json({ unlocked: false, error: "invalid_or_used_link" }, 400);

        const p = verifyToken<RestorePayload>(token);
        if (!p || p.p !== "restore" || !p.cid || !p.nonce) return fail();
        try {
          const stripe = getStripe();
          const customer = await stripe.customers.retrieve(p.cid);
          if ((customer as { deleted?: boolean }).deleted) return fail();
          const meta = (customer as { metadata?: Record<string, string> }).metadata ?? {};
          const now = Math.floor(Date.now() / 1000);
          if (meta.np_restore_nonce !== p.nonce || Number(meta.np_restore_exp ?? 0) <= now) return fail();
          const packs = await packsForCustomer(stripe, p.cid);
          if (!packs.length) return fail();

          // Burn the nonce first so the link cannot be reused.
          await stripe.customers.update(p.cid, { metadata: { np_restore_nonce: "", np_restore_exp: "" } });
          setEntitlementCookie(p.cid, packs);
          return json({ unlocked: true });
        } catch (e) {
          console.error("[nou-paint] restore redeem failed", (e as Error)?.message);
          return json({ error: "restore_failed" }, 502);
        }
      },
    },
  },
});
