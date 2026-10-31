import type Stripe from "stripe";
import { PRODUCT_KEY, packOfSession } from "./stripe.server";
import { sendConfirmationFor } from "./confirmation-email.server";
import type { SendResult } from "./email.server";
import { isPackId, PACKS, type PackId } from "../paint/catalog";

/**
 * Entitlements live ONLY in Stripe: on the Customer's metadata.
 *   np_ent_<pack>   "1" | "0"   current state for that pack (absent = never processed)
 *   np_ts_<pack>    unix secs   `created` of the last applied event for that pack (orders events)
 *   np_seen         evt_a,evt_b last ~10 event ids, for replay de-duplication
 *   np_confirm      cs_a,cs_b   last ~3 sessions whose confirmation email went out
 *   np_rnonce / np_rexp         one-time restore-link state (see restore routes)
 * No database. Writes use Stripe idempotency keys derived from the event id.
 */

const SEEN_MAX = 10;

export type ApplyResult = "granted" | "revoked" | "duplicate" | "stale" | "ignored";

function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === "string" ? x : x.id;
}

export const entKey = (pack: PackId) => `np_ent_${pack.replace(/[^a-z0-9]/g, "_")}`;
export const tsKey = (pack: PackId) => `np_ts_${pack.replace(/[^a-z0-9]/g, "_")}`;

/** Apply a grant/revoke of one pack for a customer, idempotently and in event order. */
export async function setEntitled(
  stripe: Stripe,
  customerId: string,
  pack: PackId,
  entitled: boolean,
  event: Pick<Stripe.Event, "id" | "created">,
): Promise<ApplyResult> {
  const customer = await stripe.customers.retrieve(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) return "ignored";
  const meta = (customer as Stripe.Customer).metadata ?? {};
  const seen = (meta.np_seen ?? "").split(",").filter(Boolean);

  if (seen.includes(event.id)) return "duplicate";

  const lastCreated = Number(meta[tsKey(pack)] ?? 0) || 0;
  const stale = event.created < lastCreated;
  const nextSeen = [...seen, event.id].slice(-SEEN_MAX).join(",");

  const update: Record<string, string> = { np_seen: nextSeen };
  if (!stale) {
    update[entKey(pack)] = entitled ? "1" : "0";
    update[tsKey(pack)] = String(event.created);
  }
  await stripe.customers.update(customerId, { metadata: update }, { idempotencyKey: `np_apply_${event.id}` });
  if (stale) return "stale";
  return entitled ? "granted" : "revoked";
}

/**
 * Packs this Stripe customer currently owns. Webhook state first; for packs
 * the webhook has not touched yet, look at the customer's paid sessions directly.
 */
export async function packsForCustomer(stripe: Stripe, customerId: string): Promise<PackId[]> {
  const customer = await stripe.customers.retrieve(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) return [];
  const meta = (customer as Stripe.Customer).metadata ?? {};
  const owned = new Set<PackId>();
  const unknown: PackId[] = [];
  for (const id of Object.keys(PACKS) as PackId[]) {
    const flag = meta[entKey(id)];
    if (flag === "1") owned.add(id);
    else if (flag === undefined) unknown.push(id);
  }
  if (unknown.length) {
    // Webhook has not landed yet for these packs: check paid sessions directly.
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10 });
    for (const s of sessions.data) {
      const pack = packOfSession(s);
      if (pack && unknown.includes(pack) && (await sessionIsPaidAndUnrefunded(stripe, s))) owned.add(pack);
    }
  }
  return [...owned];
}

export async function isCustomerEntitled(stripe: Stripe, customerId: string, pack?: PackId): Promise<boolean> {
  const packs = await packsForCustomer(stripe, customerId);
  return pack ? packs.includes(pack) : packs.length > 0;
}

/**
 * Immediate-supply consent evidence. A pack is NEVER granted without it:
 *  - our own metadata, written server-side only when /api/checkout saw consent
 *  - Stripe's hosted checkbox result (`consent.terms_of_service`)
 */
export function hasWaiverConsent(s: Pick<Stripe.Checkout.Session, "metadata" | "consent">): boolean {
  return (
    s.metadata?.np_consent === "accepted" &&
    Boolean(s.metadata?.np_waiver_version) &&
    s.consent?.terms_of_service === "accepted"
  );
}

/** A Checkout Session of ours that is paid and whose payment is not (fully) refunded or disputed. */
export async function sessionIsPaidAndUnrefunded(stripe: Stripe, s: Stripe.Checkout.Session): Promise<boolean> {
  if (s.metadata?.np_product !== PRODUCT_KEY) return false;
  if (!packOfSession(s)) return false;
  if (s.payment_status !== "paid") return false;
  if (!hasWaiverConsent(s)) return false;
  const piId = idOf(s.payment_intent as string | { id: string } | null);
  if (!piId) return false;
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;
  if (!charge || typeof charge === "string") return false;
  if (charge.refunded) return false;
  if (charge.disputed) return false;
  return charge.status === "succeeded";
}

export type StoreDeps = {
  /** Injected in tests. Defaults to the real Resend-backed confirmation email. */
  sendConfirmation?: (stripe: Stripe, session: Stripe.Checkout.Session) => Promise<SendResult | "already_sent">;
};

/**
 * Handle one verified Stripe event. Throws on unexpected Stripe errors so the
 * route can answer 500 and Stripe retries; returns a short label otherwise.
 */
export async function processStripeEvent(
  stripe: Stripe,
  event: Stripe.Event,
  deps: StoreDeps = {},
): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.np_product !== PRODUCT_KEY) return "ignored:foreign_product";
      const pack = packOfSession(s);
      if (!pack) return "ignored:unknown_pack";
      if (s.payment_status !== "paid") return "ignored:not_paid_yet";
      const cid = idOf(s.customer as string | { id: string } | null);
      if (!cid) return "ignored:no_customer";
      if (!hasWaiverConsent(s)) {
        // Paid without recorded consent: do not unlock. Needs a manual refund.
        console.error("[nou-paint] FLAG FOR REFUND: paid session without waiver consent", s.id);
        return "ignored:no_consent";
      }
      const applied = await setEntitled(stripe, cid, pack, true, event);
      let mail = "";
      if (applied === "granted" || applied === "duplicate") {
        // Idempotent: skips sessions already confirmed; Stripe retries a "duplicate"
        // delivery, so a failed first send is retried here too.
        const result = await (deps.sendConfirmation ?? sendConfirmationFor)(stripe, s);
        mail = `;mail:${result}`;
        // Transient provider failure: make Stripe redeliver (grant is already applied and idempotent).
        if (result === "retry") throw new Error("confirmation email transient failure");
      }
      return `grant:${applied}${mail}`;
    }

    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      // Only a FULL refund revokes; Stripe sets `refunded` true only then.
      if (!c.refunded) return "ignored:partial_refund";
      return revokeForCharge(stripe, c, event);
    }

    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const chId = idOf(d.charge as string | { id: string } | null);
      if (!chId) return "ignored:no_charge";
      const charge = await stripe.charges.retrieve(chId);
      return revokeForCharge(stripe, charge, event);
    }

    default:
      return "ignored:unhandled_type";
  }
}

async function revokeForCharge(stripe: Stripe, charge: Stripe.Charge, event: Stripe.Event): Promise<string> {
  // Only charges we created (metadata copied from the PaymentIntent) can revoke anything.
  if (charge.metadata?.np_product !== PRODUCT_KEY) {
    return charge.metadata?.np_product ? "ignored:foreign_product" : "ignored:not_our_charge";
  }
  const pack = charge.metadata?.np_pack;
  if (!isPackId(pack)) return "ignored:unknown_pack";
  const cid = idOf(charge.customer as string | { id: string } | null);
  if (!cid) return "ignored:no_customer";
  const customer = await stripe.customers.retrieve(cid);
  if ((customer as Stripe.DeletedCustomer).deleted) return "ignored:deleted_customer";
  return `revoke:${await setEntitled(stripe, cid, pack, false, event)}`;
}
