import type { PackId } from "../paint/catalog";
import type { PreOrderSummary } from "./preorder";

/** What /api/entitlement tells the browser. The browser never decides entitlement itself. */
export type EntitlementInfo = {
  packs: PackId[];
  pack: { id: PackId; title: string };
  payments: boolean;
  price: { display: string } | null;
  restore: boolean;
  summary: PreOrderSummary | null;
};

export async function fetchEntitlement(): Promise<EntitlementInfo | null> {
  try {
    const r = await fetch("/api/entitlement", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as EntitlementInfo;
  } catch {
    return null;
  }
}

/** Checkout is only ever sent to Stripe's own host. */
export function isStripeCheckoutUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}
