import { createFileRoute } from "@tanstack/react-router";
import { mayViewPage } from "@/lib/pay/entitlement-server";
import { loadPremiumImage } from "@/lib/premium-assets.server";
import { pageById } from "@/lib/paint/catalog";

/**
 * The ONLY way to get a premium page image. Anyone without a valid entitlement
 * gets 403 (known premium page) or 404 (anything else), with no-store caching so
 * a shared cache can never hand the image to someone else.
 */
export const Route = createFileRoute("/api/page/$pageId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const noStore = { "Cache-Control": "private, no-store", "Content-Type": "application/json" };
        const page = pageById(params.pageId);
        if (!page?.premium) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: noStore });
        if (!(await mayViewPage(page.id))) {
          return new Response(JSON.stringify({ error: "locked" }), { status: 403, headers: noStore });
        }
        const img = await loadPremiumImage(page.id, "paint");
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
