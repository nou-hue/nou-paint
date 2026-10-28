import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { DraftBanner } from "@/components/DraftBanner";
import { IS_DRAFT_BUILD } from "@/lib/draft";
import appCss from "../styles.css?url";

const APP_NAME = "Nou Paint";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "description", content: "Dreamy Persian paint-by-numbers. Soft colouring, your way." },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#f6f1e6" },
      // Previews and dev builds must never be indexed.
      ...(IS_DRAFT_BUILD ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_NAME },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  component: () => (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-ink"
        >
          Skip to content
        </a>
        <DraftBanner />
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
