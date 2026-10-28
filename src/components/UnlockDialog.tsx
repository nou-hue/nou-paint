import { useEffect, useId, useRef, useState } from "react";
import { ParentalGate } from "@/components/ParentalGate";
import { fetchEntitlement, isStripeCheckoutUrl, type EntitlementInfo } from "@/lib/pay/client";
import { WAIVER_SEGMENTS, WAIVER_VERSION, payButtonLabel } from "@/lib/pay/waiver";
import { EMPTY_PREORDER } from "@/lib/pay/preorder";
import type { PackId } from "@/lib/paint/catalog";

type Props = {
  pageId?: string;
  onClose: () => void;
};

const ERRORS: Record<string, string> = {
  consent_required: "Please tick the box to continue.",
  payments_not_configured: "Buying is not switched on yet. Please try again later.",
  rate_limited: "Too many tries. Please wait a few minutes.",
  already_unlocked: "This pack is already unlocked on this device.",
  stripe_terms_url_missing: "Checkout is not fully set up yet. Please try again later.",
};

/**
 * Grown-up unlock flow: parental gate FIRST, then the pre-order summary
 * (reg 14(2)), the unticked 14-day waiver checkbox, and a "Pay now" button.
 * Nothing is sent anywhere until the checkbox is ticked AND the button is pressed.
 */
export function UnlockDialog({ pageId, onClose }: Props) {
  const [passed, setPassed] = useState(false);
  if (!passed) return <ParentalGate purpose="buy something" onPass={() => setPassed(true)} onCancel={onClose} />;
  return <PurchasePanel pageId={pageId} onClose={onClose} />;
}

export function PurchasePanel({ pageId, onClose, initialInfo }: Props & { initialInfo?: EntitlementInfo }) {
  const [info, setInfo] = useState<EntitlementInfo | null | "loading">(initialInfo ?? "loading");
  const [consent, setConsent] = useState(false); // always starts UNTICKED
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    if (!initialInfo) void fetchEntitlement().then((i) => !gone && setInfo(i));
    ref.current?.focus();
    return () => {
      gone = true;
    };
  }, []);

  const loaded = info !== "loading" && info !== null ? info : null;
  const summary = loaded?.summary ?? EMPTY_PREORDER;
  const price = loaded?.price?.display ?? null;
  const canPay = Boolean(loaded?.payments) && consent && !busy;

  async function pay() {
    if (!loaded || !canPay) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          consent: true,
          waiverVersion: WAIVER_VERSION,
          packId: loaded.pack.id satisfies PackId,
          pageId,
        }),
      });
      const data = (await r.json()) as { url?: string; error?: string };
      if (r.ok && data.url && isStripeCheckoutUrl(data.url)) {
        window.location.assign(data.url);
        return;
      }
      setError(ERRORS[data.error ?? ""] ?? "Something went wrong. Nothing was charged.");
    } catch {
      setError("Could not reach the shop. Nothing was charged.");
    }
    setBusy(false);
  }

  async function restore(e: React.FormEvent) {
    e.preventDefault();
    setRestoreMsg(null);
    try {
      const r = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      if (r.ok) setRestoreMsg("If that email has a purchase, a one-time link is on its way. It lasts 30 minutes.");
      else if (r.status === 400) setRestoreMsg("That does not look like an email address.");
      else if (r.status === 429) setRestoreMsg("Too many tries. Please wait a while.");
      else setRestoreMsg("Restoring is not available right now.");
    } catch {
      setRestoreMsg("Could not reach the shop.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-ink/40 px-4 py-8"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="unlock-dialog"
        className="mx-auto w-full max-w-md rounded-[24px] bg-surface p-6 shadow-[var(--shadow-border)] outline-none"
      >
        <h2 id={titleId} className="font-display text-3xl">
          {loaded ? loaded.pack.title : "Unlock a pack"}
        </h2>

        {info === "loading" && <p className="mt-3 text-sm text-muted">Loading…</p>}
        {info === null && <p className="mt-3 text-sm text-ink">The shop could not be reached. Please try again later.</p>}

        {loaded && !loaded.payments && (
          <p className="mt-3 rounded-md bg-paper p-3 text-sm" data-testid="payments-off">
            Buying is not available yet. Nothing can be charged.
          </p>
        )}

        {loaded && loaded.packs.includes(loaded.pack.id) && (
          <p className="mt-3 rounded-md bg-paper p-3 text-sm">This pack is already unlocked on this device.</p>
        )}

        {loaded && !loaded.packs.includes(loaded.pack.id) && (
          <>
            <dl className="mt-4 space-y-2 text-sm" data-testid="preorder-summary">
              <div>
                <dt className="font-medium">What you get</dt>
                <dd className="text-muted">{summary.features}</dd>
              </div>
              <div>
                <dt className="font-medium">How long it lasts</dt>
                <dd className="text-muted">{summary.duration}</dd>
              </div>
              <div>
                <dt className="font-medium">Total price (one payment)</dt>
                <dd className="text-muted">{summary.total}</dd>
              </div>
            </dl>

            <label className="mt-5 flex items-start gap-3 text-sm" htmlFor={`${titleId}-waiver`}>
              <input
                id={`${titleId}-waiver`}
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-6 shrink-0 accent-[#80601f]"
              />
              <span>
                {WAIVER_SEGMENTS.map((s, i) =>
                  s.b ? <strong key={i}>{s.t}</strong> : <span key={i}>{s.t}</span>,
                )}
              </span>
            </label>

            <p className="mt-3 text-xs text-muted">
              By paying you agree to our{" "}
              <a className="underline" href="/terms" target="_blank" rel="noopener">
                Terms
              </a>{" "}
              and have read our{" "}
              <a className="underline" href="/privacy" target="_blank" rel="noopener">
                Privacy Notice
              </a>
              . Payment is taken by Stripe on its own page. We never see your card.
            </p>

            <button
              type="button"
              disabled={!canPay}
              onClick={() => void pay()}
              className="mt-4 h-12 w-full rounded-md bg-accent px-4 font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Opening checkout…" : payButtonLabel(price)}
            </button>
            {!consent && loaded.payments && (
              <p className="mt-2 text-xs text-muted">Tick the box above to enable the button.</p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-ink">
                {error}
              </p>
            )}

            {loaded.restore && (
              <form onSubmit={restore} className="mt-6 border-t border-line pt-4">
                <h3 className="font-display text-xl">Restore a purchase</h3>
                <label htmlFor={`${titleId}-email`} className="mt-1 block text-sm text-muted">
                  Email used when buying
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id={`${titleId}-email`}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-md border border-ink/30 bg-paper px-3"
                  />
                  <button type="submit" className="h-11 min-w-11 rounded-md border border-ink/30 px-3 text-sm">
                    Send link
                  </button>
                </div>
                {restoreMsg && (
                  <p role="status" className="mt-2 text-sm">
                    {restoreMsg}
                  </p>
                )}
              </form>
            )}
          </>
        )}

        <button type="button" onClick={onClose} className="mt-5 h-11 min-w-11 px-3 text-sm text-muted underline">
          Not now
        </button>
      </div>
    </div>
  );
}
