# Nou Paint

Dreamy Persian paint-by-numbers for iPad.

- **Kids collection**: free, anonymous, works offline. No accounts, no analytics, no third-party requests (fonts are self-hosted, strict CSP), and a parental gate before any purchase or external link.
- **Adult collection**: the Nightingale sample page is free. Premium pages (Simorgh, Garden) are served only by `GET /api/page/:id`, which checks a server-side entitlement. A one-off Stripe **test-mode** Checkout unlocks the pack.
- **Numbered regions**: `RegionPainter` paints SVG region pages (free demo: *Little garden*) with numbered fills, undo/redo, progress, keyboard control and 44px targets. Premium region SVGs, when added, go in `private/pages/<id>.svg` and are only served by the entitlement-checked route.

> Status: **draft, test mode only.** Legal text is placeholder wording and needs solicitor review. See [docs/PAYMENTS-TEST-MODE.md](docs/PAYMENTS-TEST-MODE.md).

## Develop

```bash
npm install
cp .env.example .env.local   # optional; without keys the app runs with purchases switched off
npm run dev                  # http://localhost:8080
npm run typecheck
npm test
npm run build
```

## Deploy (Vercel)

Build command: `npm run build` (Vite + Nitro emits `.vercel/output`). Preview deployments only for now; add env vars from `.env.example` to **Preview** scope only.
