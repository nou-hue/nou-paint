import { createFileRoute } from "@tanstack/react-router";
import { entitledPacks } from "@/lib/pay/entitlement-server";
import { getPriceDisplay, paymentsConfigured } from "@/lib/pay/stripe.server";
import { restoreConfigured } from "@/lib/pay/email.server";
import { hit } from "@/lib/pay/rate-limit.server";
import { buildPreOrderSummary } from "@/lib/pay/preorder";
import { ipOf, json } from "@/lib/pay/http.server";
import { PACKS, type PackId } from "@/lib/paint/catalog";

/** What the UI renders from. The browser never decides entitlement itself. */
export const Route = createFileRoute("/api/entitlement")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hit(`ent:${ipOf(request)}`, 120, 60_000).allowed) return json({ error: "rate_limited" }, 429);
        const packs = await entitledPacks();
        const packId: PackId = "dreamy-test";
        const owned = packs.includes(packId);
        const price = owned ? null : await getPriceDisplay(packId);
        return json({
          packs,
          pack: { id: packId, title: PACKS[packId].title },
          payments: paymentsConfigured() && price?.ok === true,
          price: price?.ok ? { display: price.display } : null,
          restore: restoreConfigured(),
          // Reg 14(2) pre-order summary (env-driven, visible placeholders when unset)
          summary: owned ? null : buildPreOrderSummary(price?.ok ? price.display : null),
        });
      },
    },
  },
});
