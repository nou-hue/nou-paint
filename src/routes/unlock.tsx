import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pageById } from "@/lib/paint/catalog";

type Search = { checkout?: string; session_id?: string; restore?: string; page?: string };

export const Route = createFileRoute("/unlock")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    restore: typeof s.restore === "string" ? s.restore : undefined,
    page: typeof s.page === "string" ? s.page : undefined,
  }),
  head: () => ({ meta: [{ title: "Unlock · Nou Paint" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Unlock,
});

type State = "working" | "unlocked" | "failed" | "cancelled" | "idle";

/** Landing page after Stripe Checkout or an emailed restore link. Shows no purchase UI. */
function Unlock() {
  const { checkout, session_id, restore, page } = Route.useSearch();
  const [state, setState] = useState<State>(checkout || restore ? "working" : "idle");
  const dest = page && pageById(page)?.premium ? page : null;

  useEffect(() => {
    let gone = false;
    const done = (s: State) => !gone && setState(s);
    if (restore) {
      fetch("/api/restore-redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token: restore }),
      })
        .then(async (r) => done(r.ok && (await r.json()).unlocked ? "unlocked" : "failed"))
        .catch(() => done("failed"));
    } else if (checkout === "success" && session_id) {
      // The webhook may land a moment after the redirect: try for a few seconds.
      (async () => {
        for (let i = 0; i < 6 && !gone; i++) {
          try {
            const r = await fetch(`/api/checkout-confirm?session_id=${encodeURIComponent(session_id)}`, {
              credentials: "same-origin",
            });
            if (r.ok && (await r.json()).unlocked) return done("unlocked");
          } catch {
            /* retry */
          }
          await new Promise((res) => setTimeout(res, 1500));
        }
        done("failed");
      })();
    } else if (checkout === "cancelled") {
      done("cancelled");
    }
    return () => {
      gone = true;
    };
  }, [checkout, session_id, restore]);

  return (
    <main id="main" className="damask grid min-h-dvh place-items-center px-6 py-10">
      <div className="w-full max-w-md rounded-[24px] bg-surface p-6 text-center shadow-[var(--shadow-border)]" aria-live="polite">
        <h1 className="font-display text-3xl">
          {state === "unlocked" ? "Pack unlocked" : state === "cancelled" ? "No payment taken" : "Unlock"}
        </h1>
        {state === "working" && <p className="mt-3 text-muted">Checking your purchase…</p>}
        {state === "unlocked" && <p className="mt-3 text-muted">Thank you. Your pages are ready. A confirmation email is on its way.</p>}
        {state === "cancelled" && <p className="mt-3 text-muted">You left checkout, so nothing was charged.</p>}
        {state === "failed" && (
          <p className="mt-3 text-muted">
            We could not confirm the purchase on this device. If you paid, wait a minute and reload, or use
            “Restore a purchase” on a locked page.
          </p>
        )}
        {state === "idle" && <p className="mt-3 text-muted">Nothing to do here.</p>}
        <Link
          to={dest ? "/studio/$pageId" : "/"}
          params={dest ? { pageId: dest } : undefined}
          className="mt-6 inline-flex h-12 min-w-11 items-center justify-center rounded-md bg-accent px-6 text-accent-fg"
        >
          {dest && state === "unlocked" ? "Go to my page" : "Back to Nou Paint"}
        </Link>
      </div>
    </main>
  );
}
