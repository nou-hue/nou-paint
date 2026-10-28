/**
 * Immediate-supply consent / loss of the 14-day cancellation right.
 * Wording follows the reviewed Taste Engine draft (Option A), adapted for a
 * Nou Paint pack. It is still a DRAFT pending a UK consumer-law solicitor's
 * review: any wording change MUST bump WAIVER_VERSION, because the version is
 * recorded with every purchase as evidence.
 * Safe to import from client and server code.
 */

export const WAIVER_VERSION = "v1";

/** Plain-text form (used in the confirmation email). */
export const WAIVER_TEXT_PLAIN =
  "I want my Nou Paint pack to start immediately. I understand that once it has " +
  "been unlocked for me I will lose my 14-day right to cancel this purchase.";

/** Segments for the in-app checkbox label; `b` segments render bold. */
export const WAIVER_SEGMENTS: ReadonlyArray<{ t: string; b?: boolean }> = [
  { t: "I want my Nou Paint pack to start immediately.", b: true },
  { t: " I understand that once it has been unlocked for me I will " },
  { t: "lose my 14-day right to cancel", b: true },
  { t: " this purchase." },
];

/** Order button label: states plainly that pressing it means paying. */
export function payButtonLabel(price: string | null): string {
  return price ? `Pay now ${price}` : "Pay now (order with obligation to pay)";
}

/** Stripe-hosted checkbox text (max 1,200 chars; markdown links need absolute URLs). */
export function stripeWaiverMessage(siteUrl: string): string {
  const msg =
    "**I want my Nou Paint pack to start immediately.** I understand that once it has been unlocked " +
    "for me I will **lose my 14-day right to cancel** this purchase. " +
    `I have read the [Terms](${siteUrl}/terms) and [Privacy Notice](${siteUrl}/privacy).`;
  if (msg.length > 1200) throw new Error("waiver message exceeds Stripe's 1,200 character limit");
  return msg;
}
