# Payments (Stripe TEST mode), premium gating and kids privacy

Status: **test mode only, draft.** No live keys. Do not promote to production until the legal text and seller details are final.

## What changed from the old build
- The localStorage "£1.99 unlock" is gone. Nothing in the browser can grant access.
- Premium (adult) page art lives in `private/pages/` and is bundled **server-only** (`src/lib/premium-assets.server.ts`). Public `/pages/preview/*.jpg` are small blurred teasers.
- `GET /api/page/:id`: 404 for unknown/non-premium ids, 403 without entitlement, 200 `image/jpeg` with `Cache-Control: private, no-store` when entitled. `?kind=line` returns the line-art file (Freeform walls); any other `kind` is 400.
- **Region (SVG) pages**: a premium page with `format: "regions"` is a single SVG in `private/pages/<id>.svg` (viewBox `0 0 800 800`, one `<path id data-n d>` per region), bundled server-only and returned by the same route as `image/svg+xml` with `private, no-store`, `nosniff` and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. The client parses it as data (`parseRegionSvg`) and draws its own markup; the file is never inlined into the app bundle. **No premium SVG ships yet**; `tests/fixtures/chahar-bagh-DRAFT.svg` is a test fixture only and `tests/regions-assets.test.ts` fails if it reaches `public/`, `private/`, `src/` or the build.
- Freeform walls (`lineSource`) are built from the page's line art, never the colour image. Square (mosaic) mode samples the colour image on purpose.
- Google/X sign-in, Better Auth, the Grok preview bridge/PWA scaffold, multiplayer and the DB were removed, along with the committed preview client secret.
- Kids pages: no third-party hosts (CSP `default-src 'self'` etc.), self-hosted `@fontsource` fonts, `Referrer-Policy: no-referrer`, no analytics, no data collected, parental gate (arithmetic, every time) before any purchase UI or external link.

## How payments work
- `POST /api/checkout` (needs `consent:true` + current `waiverVersion`, same-origin) creates a one-off Checkout Session for `STRIPE_PRICE_ID`. Session and PaymentIntent metadata carry `np_consent`, `np_waiver_version`, `np_consent_at`, pack id. Stripe also shows the waiver as its own required terms checkbox.
- **Entitlement store: Stripe customer metadata only** (`np_ent_<pack>`, `np_ts_<pack>`, `np_seen`, `np_confirm`, restore nonce/expiry). No database.
- `POST /api/stripe/webhook`: verifies the signature on the raw body, de-duplicates by event id and event time, grants on `checkout.session.completed` / `async_payment_succeeded` (only if consent metadata AND Stripe's `consent.terms_of_service=accepted` are present; otherwise logs `FLAG FOR REFUND`), revokes on full `charge.refunded` and `charge.dispute.created`. Idempotency keys `np_apply_<eventId>`.
- Access cookie `np_ent`: HMAC-signed, 10 min TTL, re-checked against Stripe when stale. A device cookie `np_dev` binds `client_reference_id`.
- `/unlock?checkout=success` confirms the session with Stripe (`/api/checkout-confirm`) in case the webhook is slow.
- **Restore**: email → one-time 30-minute link (nonce in customer metadata, burned on use, redeemed by POST) via Resend. Always returns the same response, whether or not an email is known.
- **Confirmation email** (reg 16(3)): restates the order, waiver and seller details; time shown in Europe/London.
- **Graceful degradation**: no Stripe vars → "Buying is not available yet", routes 503, free pages work. No email vars → restore form hidden. Production without a ≥32-char `ENTITLEMENT_COOKIE_SECRET` → premium refuses (fails closed); preview/dev use an ephemeral secret.
- A `sk_live_` key is refused unless `ALLOW_LIVE_STRIPE=1` (**leave unset**).

## Test-mode setup (needs a human with the Stripe test account)
1. Create a one-off **test** Price → `STRIPE_PRICE_ID` (placeholder price; none has been chosen).
2. Stripe Dashboard → Settings → Public details: set the **Terms of service URL** (test mode too) to `<site>/terms`. Without it Stripe rejects the consent checkbox and the app shows a "not fully set up" message.
3. Add a test webhook endpoint `https://<preview>/api/stripe/webhook`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created` → `STRIPE_WEBHOOK_SECRET`. Preview deployments sit behind Vercel Authentication, which blocks Stripe: use a protection bypass for that path, or test locally with
   `stripe listen --forward-to localhost:8080/api/stripe/webhook`.
4. Set the env vars from `.env.example` on **Preview/Development only**.
5. Cards: `4242 4242 4242 4242` pays, `4000 0000 0000 9995` declines, `4000 0025 0000 3155` 3DS.

## Legal pages
`/privacy` and `/terms` are draft text with `[PLACEHOLDERS]`. A **Draft** banner and note show on Preview/dev builds only (build flag `VITE_DRAFT_BUILD`, derived from `VERCEL_ENV` in `vite.draft.ts`). Both pages are always `noindex`; `robots.txt` also disallows `/api/` and `/studio/`. **On Production the placeholders would show without a banner.**

## Known limits
- The parental gate is client-side only (deters children, not a security control). Consent and entitlement are enforced server-side.
- Rate limits are in-memory per warm serverless instance; add a shared store before public traffic.
- Stripe metadata read-modify-write is not transactional (low risk for a single one-off pack).
- Premium originals remain in git history and in any earlier Production deployment until a redeploy; treat them as already public.
- Pack contents and price are placeholders.
