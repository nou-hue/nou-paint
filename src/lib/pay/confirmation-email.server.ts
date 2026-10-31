import type Stripe from "stripe";
import { sendEmail, type SendResult } from "./email.server";
import { WAIVER_TEXT_PLAIN } from "./waiver";
import { PACKS } from "../paint/catalog";
import { PREORDER_ENV } from "./preorder";

/**
 * Purchase confirmation on a durable medium (CCRs 2013 reg 16(3)): restates the
 * consent and acknowledgement. Seller facts are NOT invented: they come from
 * env vars, and where a value is missing a visible [PLACEHOLDER] is left so it
 * can never be mistaken for real data. DRAFT: needs solicitor review.
 */
export const CONFIRM_ENV = {
  seller: "SELLER_LEGAL_NAME",
  address: "SELLER_ADDRESS",
  contact: "SELLER_CONTACT_EMAIL",
  phone: "SELLER_PHONE", // optional
  vat: "SELLER_VAT_NUMBER", // optional
  vatStatement: PREORDER_ENV.vatStatement,
  features: PREORDER_ENV.features,
  duration: PREORDER_ENV.duration,
  refund: "REFUND_POLICY_TEXT",
  terms: "TERMS_TEXT",
} as const;

type Env = Record<string, string | undefined>;
const ph = (env: Env, key: string, placeholder: string) => env[key]?.trim() || placeholder;

export function formatLondon(unixSec: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "long", timeStyle: "short" }).format(
    new Date(unixSec * 1000),
  );
}

export type ConfirmationInput = {
  email: string;
  sessionId: string;
  paymentRef: string;
  createdUnix: number;
  amountTotal: number | null;
  currency: string | null;
  waiverVersion: string;
  consentAtIso: string;
  packTitle: string;
};

export function buildConfirmationEmail(input: ConfirmationInput, env: Env = process.env) {
  const price =
    input.amountTotal != null && input.currency
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: input.currency.toUpperCase() }).format(
          input.amountTotal / 100,
        )
      : "[PRICE]";
  const vat = ph(env, CONFIRM_ENV.vatStatement, "[VAT STATEMENT]");
  const siteUrl = env.SITE_URL?.trim().replace(/\/+$/, "") || "[SITE ADDRESS]";
  const contactBits = [
    ph(env, CONFIRM_ENV.contact, "[CONTACT EMAIL]"),
    env[CONFIRM_ENV.phone]?.trim(),
    env[CONFIRM_ENV.vat]?.trim() ? `VAT ${env[CONFIRM_ENV.vat]!.trim()}` : undefined,
  ].filter(Boolean);

  const text = `Thank you for buying ${input.packTitle} for Nou Paint.

Order details
- Product: ${input.packTitle}, ${ph(env, CONFIRM_ENV.features, "[PACK CONTENTS]")}, ${ph(env, CONFIRM_ENV.duration, "[PRODUCT DURATION]")}
- Price paid: ${price} incl. VAT ${vat}
- Date and time of purchase: ${formatLondon(input.createdUnix)} (Europe/London)
- Order / payment reference: ${input.paymentRef}
- Email used: ${input.email}

Your consent and acknowledgement
When you bought, you ticked the box saying:
"${WAIVER_TEXT_PLAIN}"
Waiver text ${input.waiverVersion}, ticked on ${input.consentAtIso}.
Because the pack was unlocked straight away, your 14-day right to cancel under the
Consumer Contracts Regulations 2013 ended when we unlocked it.

Your other rights
This does not affect your legal rights if the pack is faulty or not as described.
See "If something is wrong" in our Terms, below. ${ph(env, CONFIRM_ENV.refund, "[REFUND POLICY]")}

Restore your pack on another device or browser
Go to ${siteUrl}, open a grown-up area (Unlock), choose "Restore purchase", and enter
this email address. We will send a one-time link, valid for 30 minutes.

Who we are
${ph(env, CONFIRM_ENV.seller, "[SELLER / TRADER FULL LEGAL NAME]")}, ${ph(env, CONFIRM_ENV.address, "[TRADING / REGISTERED ADDRESS]")}
${contactBits.join(" · ")}

Terms of Use (full text pasted or attached, as Schedule 2 information):
${ph(env, CONFIRM_ENV.terms, "[PASTE THE FINAL TERMS TEXT or ATTACH AS PDF]")}
`;
  return { subject: `Your Nou Paint purchase: confirmation`, text };
}

/** Placeholders still visible in a built email (for logging / tests). */
export function unresolvedPlaceholders(text: string): string[] {
  return Array.from(new Set(text.match(/\[[A-Z][A-Z /,.'-]{3,}[A-Za-z ]*\]/g) ?? []));
}

const idOf = (x: string | { id: string } | null | undefined) => (!x ? null : typeof x === "string" ? x : x.id);

/**
 * Send the confirmation for a paid session. Safe to call repeatedly:
 *  - skips if this session id is already recorded on the customer (metadata `np_confirm`)
 *  - sends with a provider Idempotency-Key derived from the session id
 *  - returns "skipped" when Resend isn't configured or the buyer has no email
 */
export async function sendConfirmationFor(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  send: typeof sendEmail = sendEmail,
): Promise<SendResult | "already_sent"> {
  const cid = idOf(session.customer as string | { id: string } | null);
  const email = session.customer_details?.email ?? null;
  if (!cid || !email) {
    console.warn("[nou-paint] confirmation email skipped: no customer or buyer email");
    return "skipped";
  }

  const customer = await stripe.customers.retrieve(cid);
  if ((customer as Stripe.DeletedCustomer).deleted) return "skipped";
  const sent = ((customer as Stripe.Customer).metadata?.np_confirm ?? "").split(",").filter(Boolean);
  if (sent.includes(session.id)) return "already_sent";

  
  const packId = session.metadata?.np_pack as keyof typeof PACKS | undefined;
  const { subject, text } = buildConfirmationEmail({
    email,
    sessionId: session.id,
    paymentRef: idOf(session.payment_intent as string | { id: string } | null) ?? session.id,
    createdUnix: session.created,
    amountTotal: session.amount_total,
    currency: session.currency,
    waiverVersion: session.metadata?.np_waiver_version ?? "unknown",
    consentAtIso: session.metadata?.np_consent_at ?? "unknown",
    packTitle: (packId && PACKS[packId]?.title) || "Nou Paint pack",
  });

  const missing = unresolvedPlaceholders(text);
  if (missing.length) console.warn("[nou-paint] confirmation email has unresolved placeholders:", missing.join(" "));

  const result = await send({ to: email, subject, text, idempotencyKey: `np_confirm_${session.id}` });
  if (result === "sent") {
    await stripe.customers.update(
      cid,
      { metadata: { np_confirm: [...sent, session.id].slice(-3).join(",") } },
      { idempotencyKey: `np_confirm_mark_${session.id}` },
    );
  } else if (result === "skipped") {
    console.warn("[nou-paint] confirmation email skipped: email provider not configured");
  }
  return result;
}
