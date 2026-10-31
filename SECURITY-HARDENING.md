# Security hardening (DO NOT MERGE until reviewed)

Branch `sec/hardening-20261031`. Preview-only changes; no production env vars, DNS or deploys were touched.

## Changes
- **Baked secret removed**: the shared Grok preview-client secret was committed in `src/lib/auth/preview.ts` (git history, commit ). It is now read from `GROK_PREVIEW_CLIENT_SECRET` env. The old value stays in history: treat it as exposed and rotate it with the Grok auth broker.
- **Fail closed**: `verify.server.ts` never falls back to the shared dev user in a hosted runtime (VERCEL / production).
- **Security headers** (nitro routeRules in `vite.config.ts`): enforced minimal CSP (`frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, upgrade-insecure-requests), full CSP in **Report-Only**, HSTS (2y, includeSubDomains), X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, X-Frame-Options.
- **Production source maps off**.
- `.gitleaks.toml` for local/CI scanning.
