import { createFileRoute } from "@tanstack/react-router";
import { readDevice, setEntitlementCookie } from "@/lib/pay/entitlement-server";
import { packsForCustomer, sessionIsPaidAndUnrefunded } from "@/lib/pay/entitlement-store.server";
import { getStripe, paymentsConfigured } from "@/lib/pay/stripe.server";
import { signingAvailable } from "@/lib/pay/signing.server";
import { hit } from "@/lib/pay/rate-limit.server";
import { ipOf, json } from "@/lib/pay/http.server";

const MAX_SESSION_AGE_SEC = 60 * 60;

/**
 * Instant access on return from Checkout. The webhook stays the source of
 * truth; this only issues the short-lived signed cookie, and only when:
 *  - the session is ours, paid, consented, not refunded/disputed,
 *  - it was created in the last hour (an old session id cannot re-grant),
 *  - it was started from THIS device (client_reference_id == device cookie id).
 */
export const Route = createFileRoute("/api/checkout-confirm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!paymentsConfigured() || !signingAvailable()) return json({ error: "payments_not_configured" }, 503);
        if (!hit(`confirm:${ipOf(request)}`, 20, 10 * 60_000).allowed) return json({ error: "rate_limited" }, 429);
        const sid = new URL(request.url).searchParams.get("session_id") ?? "";
        if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return json({ error: "bad_session" }, 400);
        try {
          const stripe = getStripe();
          const session = await stripe.checkout.sessions.retrieve(sid);
          const device = readDevice();
          const age = Math.floor(Date.now() / 1000) - session.created;
          const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;

          if (!customer || session.client_reference_id !== device.id || age > MAX_SESSION_AGE_SEC) {
            return json({ unlocked: false, reason: "mismatch" });
          }
          if (!(await sessionIsPaidAndUnrefunded(stripe, session))) {
            return json({ unlocked: false, reason: "not_paid" });
          }
          const packs = await packsForCustomer(stripe, customer);
          if (!packs.length) return json({ unlocked: false, reason: "not_paid" });
          setEntitlementCookie(customer, packs);
          return json({ unlocked: true });
        } catch (e) {
          console.error("[nou-paint] checkout confirm failed", (e as Error)?.message);
          return json({ error: "confirm_failed" }, 502);
        }
      },
    },
  },
});
