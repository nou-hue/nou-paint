import { useState, type ReactNode } from "react";
import { ParentalGate } from "@/components/ParentalGate";

/**
 * The ONLY way the app links off-site. It never renders a real href: a tap asks
 * the parental gate first, and only then opens the URL (no referrer, new tab).
 * Using a button (not an anchor) also means a child cannot long-press or middle-click it open.
 */
export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setAsking(true)} data-external-href={href}>
        {children}
      </button>
      {asking && (
        <ParentalGate
          purpose="open a website outside Nou Paint"
          onCancel={() => setAsking(false)}
          onPass={() => {
            setAsking(false);
            window.open(href, "_blank", "noopener,noreferrer");
          }}
        />
      )}
    </>
  );
}
