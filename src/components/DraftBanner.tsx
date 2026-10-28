import { IS_DRAFT_BUILD } from "@/lib/draft";

/** Shown on Preview and dev only. Never rendered in a Production build. */
export function DraftBanner() {
  if (!IS_DRAFT_BUILD) return null;
  return (
    <div
      role="note"
      data-testid="draft-banner"
      className="bg-ink px-4 py-2 text-center text-sm font-medium text-surface"
    >
      Draft: test mode, not live. Legal text and prices are placeholders. Do not publish.
    </div>
  );
}
