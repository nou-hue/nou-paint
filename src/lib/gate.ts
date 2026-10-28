/**
 * Parental gate: a short sum a young child is unlikely to solve, asked EVERY
 * time before a purchase or an external link. Pure logic (no storage, no
 * network), so nothing about the grown-up or the child is ever recorded.
 *
 * This is a client-side speed bump, not security: money and entitlement are
 * enforced on the server (consent flag + Stripe), never here.
 */

export type GateChallenge = { question: string; answer: number };

export function makeChallenge(rand: () => number = Math.random): GateChallenge {
  const pick = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const a = pick(6, 9);
  const b = pick(6, 9);
  const c = pick(11, 19);
  return { question: `What is ${a} × ${b} + ${c}?`, answer: a * b + c };
}

/** Accepts only a whole number typed in digits; anything else fails. */
export function checkAnswer(challenge: GateChallenge, input: string): boolean {
  const t = input.trim();
  return /^\d{1,4}$/.test(t) && Number(t) === challenge.answer;
}
