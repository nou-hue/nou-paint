import { describe, expect, it, vi } from "vitest";
import { processStripeEvent, packsForCustomer, sessionIsPaidAndUnrefunded } from "../src/lib/pay/entitlement-store.server";
import { evt, fakeStripe, paidSession } from "./helpers";

const okMail = vi.fn(async () => "sent" as const);
const deps = { sendConfirmation: okMail };

describe("webhook entitlement store", () => {
  it("grants a pack on a paid, consented session and records it in Stripe customer metadata", async () => {
    const { stripe, customers } = fakeStripe({ customers: { cus_1: {} } });
    const out = await processStripeEvent(stripe, evt("evt_1", "checkout.session.completed", paidSession()), deps);
    expect(out).toContain("grant:granted");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBe("1");
    expect(okMail).toHaveBeenCalled();
  });

  it("never grants without the recorded waiver consent", async () => {
    const { stripe, customers } = fakeStripe({ customers: { cus_1: {} } });
    const s = paidSession({ metadata: { np_product: "nou_paint_pack", np_pack: "dreamy-test" } });
    expect(await processStripeEvent(stripe, evt("evt_2", "checkout.session.completed", s), deps)).toBe("ignored:no_consent");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBeUndefined();
    // Stripe's own checkbox result must also be accepted
    const s2 = paidSession({ consent: { terms_of_service: null } as never });
    expect(await processStripeEvent(stripe, evt("evt_3", "checkout.session.completed", s2), deps)).toBe("ignored:no_consent");
  });

  it("does not grant an unpaid session or a foreign product", async () => {
    const { stripe } = fakeStripe({ customers: { cus_1: {} } });
    expect(
      await processStripeEvent(stripe, evt("e", "checkout.session.completed", paidSession({ payment_status: "unpaid" })), deps),
    ).toBe("ignored:not_paid_yet");
    const foreign = paidSession({ metadata: { np_product: "something_else" } });
    expect(await processStripeEvent(stripe, evt("e2", "checkout.session.completed", foreign), deps)).toBe("ignored:foreign_product");
  });

  it("is idempotent: a replayed event id is a duplicate and changes nothing", async () => {
    const { stripe, updates } = fakeStripe({ customers: { cus_1: {} } });
    const e = evt("evt_dup", "checkout.session.completed", paidSession());
    await processStripeEvent(stripe, e, deps);
    const n = updates.length;
    expect(await processStripeEvent(stripe, e, deps)).toContain("grant:duplicate");
    expect(updates.length).toBe(n);
  });

  it("uses an idempotency key derived from the event id for the Stripe write", async () => {
    const { stripe, updates } = fakeStripe({ customers: { cus_1: {} } });
    await processStripeEvent(stripe, evt("evt_key", "checkout.session.completed", paidSession()), deps);
    expect(updates[0].key).toBe("np_apply_evt_key");
  });

  it("revokes on a full refund and ignores a partial refund", async () => {
    const { stripe, customers } = fakeStripe({ customers: { cus_1: { np_ent_dreamy_test: "1" } } });
    const charge = { id: "ch_1", customer: "cus_1", refunded: false, metadata: { np_product: "nou_paint_pack", np_pack: "dreamy-test" } };
    expect(await processStripeEvent(stripe, evt("e_p", "charge.refunded", charge), deps)).toBe("ignored:partial_refund");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBe("1");
    expect(await processStripeEvent(stripe, evt("e_r", "charge.refunded", { ...charge, refunded: true }), deps)).toBe("revoke:revoked");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBe("0");
  });

  it("revokes on a dispute", async () => {
    const charge = { id: "ch_9", customer: "cus_1", metadata: { np_product: "nou_paint_pack", np_pack: "dreamy-test" } };
    const { stripe, customers } = fakeStripe({ customers: { cus_1: { np_ent_dreamy_test: "1" } }, charges: { ch_9: charge } });
    expect(await processStripeEvent(stripe, evt("e_d", "charge.dispute.created", { charge: "ch_9" }), deps)).toBe("revoke:revoked");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBe("0");
  });

  it("ignores refunds for charges that are not ours", async () => {
    const { stripe, customers } = fakeStripe({ customers: { cus_1: { np_ent_dreamy_test: "1" } } });
    const charge = { id: "ch_x", customer: "cus_1", refunded: true, metadata: {} };
    expect(await processStripeEvent(stripe, evt("e_x", "charge.refunded", charge), deps)).toBe("ignored:not_our_charge");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBe("1");
  });

  it("applies events in order: a stale grant cannot undo a newer revoke", async () => {
    const { stripe, customers } = fakeStripe({ customers: { cus_1: { np_ent_dreamy_test: "0", np_ts_dreamy_test: "1700000500" } } });
    const out = await processStripeEvent(stripe, evt("late", "checkout.session.completed", paidSession(), 1_700_000_100), deps);
    expect(out).toContain("grant:stale");
    expect(customers.get("cus_1")!.metadata.np_ent_dreamy_test).toBe("0");
  });

  it("makes Stripe redeliver when the confirmation email fails transiently", async () => {
    const { stripe } = fakeStripe({ customers: { cus_1: {} } });
    const flaky = { sendConfirmation: async () => "retry" as const };
    await expect(processStripeEvent(stripe, evt("evt_m", "checkout.session.completed", paidSession()), flaky)).rejects.toThrow();
  });

  it("does not fail the webhook when email is simply not configured", async () => {
    const { stripe } = fakeStripe({ customers: { cus_1: {} } });
    const skip = { sendConfirmation: async () => "skipped" as const };
    expect(await processStripeEvent(stripe, evt("evt_s", "checkout.session.completed", paidSession()), skip)).toContain("mail:skipped");
  });
});

describe("packsForCustomer / sessionIsPaidAndUnrefunded", () => {
  const ok = { id: "ch", status: "succeeded", refunded: false, disputed: false };

  it("trusts webhook state, and falls back to paid sessions before the webhook lands", async () => {
    const owned = fakeStripe({ customers: { cus_1: { np_ent_dreamy_test: "1" } } });
    expect(await packsForCustomer(owned.stripe, "cus_1")).toEqual(["dreamy-test"]);
    const revoked = fakeStripe({ customers: { cus_1: { np_ent_dreamy_test: "0" } }, sessions: [paidSession()] });
    expect(await packsForCustomer(revoked.stripe, "cus_1")).toEqual([]);
    const early = fakeStripe({ customers: { cus_1: {} }, sessions: [paidSession()], intents: { pi_1: { latest_charge: ok } } });
    expect(await packsForCustomer(early.stripe, "cus_1")).toEqual(["dreamy-test"]);
  });

  it("rejects refunded or disputed charges", async () => {
    for (const bad of [{ ...ok, refunded: true }, { ...ok, disputed: true }, { ...ok, status: "failed" }]) {
      const { stripe } = fakeStripe({ intents: { pi_1: { latest_charge: bad } } });
      expect(await sessionIsPaidAndUnrefunded(stripe, paidSession())).toBe(false);
    }
  });
});
