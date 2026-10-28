import { createFileRoute } from "@tanstack/react-router";
import { getStripe, webhookConfigured } from "@/lib/pay/stripe.server";
import { processStripeEvent } from "@/lib/pay/entitlement-store.server";
import { json } from "@/lib/pay/http.server";

/**
 * Stripe webhook (TEST mode). Signature is verified against the RAW body.
 * Bad/missing signature -> 400. Unexpected processing error -> 500 so Stripe
 * retries; replays are de-duplicated inside processStripeEvent.
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!webhookConfigured()) return json({ error: "webhook_not_configured" }, 503);
        const sig = request.headers.get("stripe-signature");
        if (!sig) return json({ error: "missing_signature" }, 400);

        const stripe = getStripe();
        const body = await request.text();
        let event;
        try {
          event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET as string);
        } catch {
          return json({ error: "bad_signature" }, 400);
        }
        try {
          const outcome = await processStripeEvent(stripe, event);
          console.log("[nou-paint] webhook", event.type, outcome);
          return json({ received: true });
        } catch (e) {
          console.error("[nou-paint] webhook processing failed", event.type, (e as Error)?.message);
          return json({ error: "processing_failed" }, 500);
        }
      },
    },
  },
});
