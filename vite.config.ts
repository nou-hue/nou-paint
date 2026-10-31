import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { draftBuild } from "./vite.draft";

// Strict, self-only policy: kids pages must make no third-party requests.
// Inline scripts/styles stay allowed because TanStack Start streams inline
// hydration scripts. Stripe Checkout is a top-level navigation, not a
// subresource, so it needs no connect/frame allowance.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// `0.0.0.0:8080` is the dev-server contract; keep host/port.
// `nitro` is gated to `build` (the Vercel deploy target).
export default defineConfig(({ command, mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  define: {
    "import.meta.env.VITE_DRAFT_BUILD": JSON.stringify(draftBuild(command, mode) ? "1" : "0"),
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    ...(command === "build"
      ? [
          nitro({
            preset: "vercel",
            routeRules: {
              "/**": {
                headers: {
                  "content-security-policy": CSP,
                  "referrer-policy": "no-referrer",
                  "x-content-type-options": "nosniff",
                  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
                },
              },
              "/api/**": { headers: { "cache-control": "private, no-store" } },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
