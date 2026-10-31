import { describe, expect, it } from "vitest";
import { buildPreOrderSummary, EMPTY_PREORDER, PREORDER_ENV } from "../src/lib/pay/preorder";
import { CONFIRM_ENV, buildConfirmationEmail, unresolvedPlaceholders } from "../src/lib/pay/confirmation-email.server";
import { WAIVER_SEGMENTS, WAIVER_TEXT_PLAIN, WAIVER_VERSION, payButtonLabel, stripeWaiverMessage } from "../src/lib/pay/waiver";

describe("pre-order summary (reg 14(2))", () => {
  it("shows visible placeholders when nothing is configured", () => {
    const s = buildPreOrderSummary(null, {});
    expect(s).toEqual(EMPTY_PREORDER);
    expect(s.total).toContain("[PRICE]");
    expect(s.total).toContain("[VAT STATEMENT]");
  });

  it("uses the Stripe price and env wording when present", () => {
    const s = buildPreOrderSummary("£4.99", { PACK_FEATURE_LIST: "2 pages", PACK_DURATION: "yours to keep", VAT_STATEMENT: "(VAT included)" });
    expect(s).toEqual({ features: "2 pages", duration: "yours to keep", total: "£4.99 (VAT included)" });
  });

  it("client and server share the same env names", () => {
    expect(CONFIRM_ENV.features).toBe(PREORDER_ENV.features);
    expect(CONFIRM_ENV.duration).toBe(PREORDER_ENV.duration);
    expect(CONFIRM_ENV.vatStatement).toBe(PREORDER_ENV.vatStatement);
  });
});

describe("waiver and pay button", () => {
  it("labels the order button as a payment", () => {
    expect(payButtonLabel("£4.99")).toBe("Pay now £4.99");
    expect(payButtonLabel(null)).toMatch(/Pay now/);
    expect(payButtonLabel(null)).not.toMatch(/continue|next|unlock/i);
  });

  it("the checkbox text says it loses the 14-day right, and matches the plain text", () => {
    expect(WAIVER_SEGMENTS.map((s) => s.t).join("")).toBe(WAIVER_TEXT_PLAIN);
    expect(WAIVER_TEXT_PLAIN).toMatch(/lose my 14-day right to cancel/);
    expect(WAIVER_VERSION).toBeTruthy();
  });

  it("the Stripe checkbox message fits Stripe's limit and links Terms and Privacy absolutely", () => {
    const m = stripeWaiverMessage("https://example.vercel.app");
    expect(m.length).toBeLessThanOrEqual(1200);
    expect(m).toContain("(https://example.vercel.app/terms)");
    expect(m).toContain("(https://example.vercel.app/privacy)");
  });
});

describe("confirmation email (reg 16(3))", () => {
  const input = {
    email: "buyer@example.com",
    sessionId: "cs_test_1",
    paymentRef: "pi_1",
    createdUnix: 1_700_000_000,
    amountTotal: 499,
    currency: "gbp",
    waiverVersion: "v1",
    consentAtIso: "2026-10-28T10:00:00.000Z",
    packTitle: "Dreamy test pack",
  };

  it("restates the consent, the loss of the right to cancel, price and time in Europe/London", () => {
    const { text, subject } = buildConfirmationEmail(input, { SITE_URL: "https://nou.example" });
    expect(subject).toMatch(/confirmation/i);
    expect(text).toContain(WAIVER_TEXT_PLAIN);
    expect(text).toContain("£4.99");
    expect(text).toContain("Waiver text v1");
    expect(text).toContain("Europe/London");
    expect(text).toContain("https://nou.example");
  });

  it("leaves visible placeholders for facts we must not invent", () => {
    const { text } = buildConfirmationEmail(input, {});
    expect(unresolvedPlaceholders(text)).toEqual(expect.arrayContaining(["[SELLER / TRADER FULL LEGAL NAME]", "[REFUND POLICY]"]));
  });
});
