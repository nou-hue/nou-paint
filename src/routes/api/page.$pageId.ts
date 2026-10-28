import { createFileRoute } from "@tanstack/react-router";
import { mayViewPage } from "@/lib/pay/entitlement-server";
import { loadPremiumImage, loadPremiumSvg } from "@/lib/premium-assets.server";
import { pageById } from "@/lib/paint/catalog";

/**
 * The ONLY way to get a premium page file (JPEG, or SVG for region pages). Anyone without a valid entitlement
 * gets 403 (known premium page) or 404 (anything else), with no-store caching so
 * a shared cache can never hand the image to someone else.
 */
export const Route = createFileRoute("/api/page/$pageId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const noStore = { "Cache-Control": "private, no-store", "Content-Type": "application/json" };
        const page = pageById(params.pageId);
        if (!page?.premium) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: noStore });
        if (!(await mayViewPage(page.id))) {
          return new Response(JSON.stringify({ error: "locked" }), { status: 403, headers: noStore });
        }
        if (page.format === "regions") {
          const svg = await loadPremiumSvg(page.id);
          if (!svg) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: noStore });
          return new Response(svg, {
            status: 200,
            headers: {
              "Content-Type": "image/svg+xml; charset=utf-8",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              // The file is data for the painter. If it is ever opened directly, it may not run anything or load anything.
              "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            },
          });
        }
        const kind = new URL(request.url).searchParams.get("kind") ?? "paint";
        if (kind !== "paint" && kind !== "line") {
          return new Response(JSON.stringify({ error: "bad_kind" }), { status: 400, headers: noStore });
        }
        const img = await loadPremiumImage(page.id, kind);
        if (!img) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: noStore });
        return new Response(new Uint8Array(img), {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Length": String(img.length),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
