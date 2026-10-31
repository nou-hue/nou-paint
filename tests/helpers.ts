import type Stripe from "stripe";

/** Minimal in-memory Stripe fake: only what the entitlement store touches. */
export function fakeStripe(init: {
  customers?: Record<string, Record<string, string>>;
  charges?: Record<string, Partial<Stripe.Charge>>;
  intents?: Record<string, { latest_charge: Partial<Stripe.Charge> | string | null }>;
  sessions?: Partial<Stripe.Checkout.Session>[];
} = {}) {
  const customers = new Map(Object.entries(init.customers ?? {}).map(([id, metadata]) => [id, { id, metadata: { ...metadata } }]));
  const updates: { id: string; metadata: Record<string, string>; key?: string }[] = [];
  const stripe = {
    customers: {
      retrieve: async (id: string) => customers.get(id) ?? { id, deleted: true },
      update: async (id: string, p: { metadata: Record<string, string> }, o?: { idempotencyKey?: string }) => {
        const c = customers.get(id);
        if (!c) throw new Error("no such customer");
        c.metadata = { ...c.metadata, ...p.metadata };
        updates.push({ id, metadata: p.metadata, key: o?.idempotencyKey });
        return c;
      },
    },
    charges: { retrieve: async (id: string) => init.charges?.[id] },
    paymentIntents: { retrieve: async (id: string) => init.intents?.[id] },
    checkout: { sessions: { list: async () => ({ data: init.sessions ?? [] }) } },
  };
  return { stripe: stripe as unknown as Stripe, customers, updates };
}

export function paidSession(over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    customer: "cus_1",
    payment_intent: "pi_1",
    created: 1_700_000_000,
    metadata: {
      np_product: "nou_paint_pack",
      np_pack: "dreamy-test",
      np_consent: "accepted",
      np_waiver_version: "v1",
      np_consent_at: "2026-10-28T10:00:00.000Z",
    },
    consent: { terms_of_service: "accepted" },
    customer_details: { email: "buyer@example.com" },
    amount_total: 499,
    currency: "gbp",
    ...over,
  } as unknown as Stripe.Checkout.Session;
}

export const evt = (id: string, type: string, object: unknown, created = 1_700_000_100) =>
  ({ id, type, created, data: { object } }) as unknown as Stripe.Event;
