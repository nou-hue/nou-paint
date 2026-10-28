import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { randomId, signToken, signingAvailable } from "@/lib/pay/signing.server";
import { getStripe, paymentsConfigured, sameOrigin, siteUrl } from "@/lib/pay/stripe.server";
import { restoreConfigured, sendRestoreEmail } from "@/lib/pay/email.server";
import { entKey } from "@/lib/pay/entitlement-store.server";
import { hit } from "@/lib/pay/rate-limit.server";
import { ipOf, json, readJson } from "@/lib/pay/http.server";
import { PACKS, type PackId } from "@/lib/paint/catalog";

const RESTORE_TTL_SEC = 30 * 60;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/**
 * Restore purchase: email a one-time link. Always answers {ok:true} for a
 * well-formed email so the endpoint cannot be used to discover who bought.
 */
export const Route = createFileRoute("/api/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ error: "bad_origin" }, 403);
        if (!paymentsConfigured() || !signingAvailable() || !restoreConfigured()) {
          return json({ error: "restore_not_configured" }, 503);
        }
        if (!hit(`restore-ip:${ipOf(request)}`, 5, 60 * 60_000).allowed) return json({ error: "rate_limited" }, 429);

        const body = await readJson<{ email: unknown }>(request);
        const email = typeof body.email === "string" ? body.email.trim() : "";
        if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "bad_email" }, 400);
        if (!hit(`restore-email:${email.toLowerCase()}`, 3, 60 * 60_000).allowed) return json({ ok: true }); // silently throttled

        try {
          const stripe = getStripe();
          const candidates = Array.from(new Set([email, email.toLowerCase()]));
          const found: Stripe.Customer[] = [];
          for (const e of candidates) {
            const list = await stripe.customers.list({ email: e, limit: 10 });
            for (const c of list.data) if (!found.some((x) => x.id === c.id)) found.push(c);
          }
          const owns = (c: Stripe.Customer) => (Object.keys(PACKS) as PackId[]).some((p) => c.metadata?.[entKey(p)] === "1");
          const customer = found.filter(owns).sort((a, b) => b.created - a.created)[0];

          if (customer) {
            const nonce = randomId(18);
            const exp = Math.floor(Date.now() / 1000) + RESTORE_TTL_SEC;
            await stripe.customers.update(customer.id, { metadata: { np_restore_nonce: nonce, np_restore_exp: String(exp) } });
            const token = signToken({ p: "restore", cid: customer.id, nonce, exp });
            const link = `${siteUrl(new URL(request.url).origin)}/unlock?restore=${encodeURIComponent(token)}`;
            const sent = await sendRestoreEmail(email, link);
            if (!sent) console.error("[nou-paint] restore email not sent");
            if (!sent && process.env.NODE_ENV !== "production") console.log("[nou-paint] dev restore link:", link);
          }
        } catch (e) {
          console.error("[nou-paint] restore lookup failed", (e as Error)?.message);
          return json({ error: "restore_failed" }, 502);
        }
        return json({ ok: true });
      },
    },
  },
});
