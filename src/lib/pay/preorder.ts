/** Same env names as CONFIRM_ENV in confirmation-email.server.ts (kept separate so the client bundle stays server-free; a test asserts they match). */
export const PREORDER_ENV = {
  features: "PACK_FEATURE_LIST",
  duration: "PACK_DURATION",
  vatStatement: "VAT_STATEMENT",
} as const;

/**
 * Pre-order summary (Consumer Contracts Regulations 2013, reg 14(2)): the main
 * characteristics, duration and total price incl. taxes, shown directly by the
 * order button. Every value comes from env / Stripe and falls back to a VISIBLE
 * placeholder; nothing is invented here.
 */
export type PreOrderSummary = {
  features: string;
  duration: string;
  /** Stripe price + VAT statement, e.g. "£x.xx (VAT included)". */
  total: string;
};

export const PREORDER_PLACEHOLDERS = {
  features: "[PACK CONTENTS]",
  duration: "[PRODUCT DURATION]",
  price: "[PRICE]",
  vat: "[VAT STATEMENT]",
} as const;

export const EMPTY_PREORDER: PreOrderSummary = {
  features: PREORDER_PLACEHOLDERS.features,
  duration: PREORDER_PLACEHOLDERS.duration,
  total: `${PREORDER_PLACEHOLDERS.price} ${PREORDER_PLACEHOLDERS.vat}`,
};

type Env = Record<string, string | undefined>;
const val = (env: Env, key: string, placeholder: string) => env[key]?.trim() || placeholder;

export function buildPreOrderSummary(priceDisplay: string | null | undefined, env: Env = process.env): PreOrderSummary {
  const price = priceDisplay?.trim() || PREORDER_PLACEHOLDERS.price;
  const vat = val(env, PREORDER_ENV.vatStatement, PREORDER_PLACEHOLDERS.vat);
  return {
    features: val(env, PREORDER_ENV.features, PREORDER_PLACEHOLDERS.features),
    duration: val(env, PREORDER_ENV.duration, PREORDER_PLACEHOLDERS.duration),
    total: `${price} ${vat}`,
  };
}
