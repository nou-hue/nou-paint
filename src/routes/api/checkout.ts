import { createFileRoute } from "@tanstack/react-router";
import { readDevice, writeDevice, entitledPacks } from "@/lib/pay/entitlement-server";
import { PRODUCT_KEY, getStripe, paymentsConfigured, priceIdFor, sameOrigin, siteUrl } from "@/lib/pay/stripe.server";
import { signingAvailable } from "@/lib/pay/signing.server";
import { WAIVER_VERSION, stripeWaiverMessage } from "@/lib/pay/waiver";
import { hit } from "@/lib/pay/rate-limit.server";
import { ipOf, json, readJson } from "@/lib/pay/http.server";
import { isPackId, pageById } from "@/lib/paint/catalog";

/** Create a Stripe Checkout Session (TEST mode) and return its URL. */
export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ error: "bad_origin" }, 403);
        const body = await readJson<{ consent: unknown; waiverVersion: unknown; packId: unknown; pageId: unknown }>(request);

        // Immediate-supply consent is enforced HERE, not just in the UI.
        if (body.consent !== true) return json({ error: "consent_required" }, 400);
        if (body.waiverVersion !== WAIVER_VERSION) return json({ error: "waiver_version_mismatch" }, 409);
        if (!isPackId(body.packId)) return json({ error: "unknown_pack" }, 400);
        const pack = body.packId;
        const returnPage = typeof body.pageId === "string" && pageById(body.pageId)?.premium ? body.pageId : "";

        if (!paymentsConfigured() || !signingAvailable()) return json({ error: "payments_not_configured" }, 503);
        if (!hit(`checkout:${ipOf(request)}`, 10, 10 * 60_000).allowed) return json({ error: "rate_limited" }, 429);
        if ((await entitledPacks()).includes(pack)) return json({ error: "already_unlocked" }, 409);

        const device = readDevice();
        writeDevice(device); // make sure the device cookie exists before we leave the site
        const site = siteUrl(new URL(request.url).origin);
        const stripe = getStripe();

        try {
          const meta = {
            np_product: PRODUCT_KEY,
            np_pack: pack,
            np_device: device.id,
            np_consent: "accepted",
            np_waiver_version: WAIVER_VERSION,
            np_consent_at: new Date().toISOString(),
          };
          const submit = process.env.CHECKOUT_SUBMIT_TEXT;
          const pageQ = returnPage ? `&page=${encodeURIComponent(returnPage)}` : "";
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: priceIdFor(pack) as string, quantity: 1 }],
            customer_creation: "always",
            client_reference_id: device.id,
            metadata: meta,
            payment_intent_data: { metadata: meta },
            success_url: `${site}/unlock?checkout=success&session_id={CHECKOUT_SESSION_ID}${pageQ}`,
            cancel_url: `${site}/unlock?checkout=cancelled${pageQ}`,
            submit_type: "pay",
            consent_collection: { terms_of_service: "required" },
            custom_text: {
              terms_of_service_acceptance: { message: stripeWaiverMessage(site) },
              ...(submit ? { submit: { message: submit.slice(0, 1200) } } : {}),
            },
          });
          if (!session.url) return json({ error: "no_session_url" }, 502);
          return json({ url: session.url });
        } catch (e) {
          const msg = (e as Error)?.message ?? "";
          console.error("[nou-paint] checkout create failed", msg);
          // Stripe refuses the terms checkbox until a Terms URL is set in Dashboard > Settings > Public details.
          if (/terms of service/i.test(msg)) return json({ error: "stripe_terms_url_missing" }, 503);
          return json({ error: "checkout_failed" }, 502);
        }
      },
    },
  },
});
