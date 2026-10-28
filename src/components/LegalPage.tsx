import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { IS_DRAFT_BUILD } from "@/lib/draft";

/** Shared shell for /privacy and /terms. Text is DRAFT with visible [PLACEHOLDERS]. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main id="main" className="damask min-h-dvh px-5 py-8 sm:px-8">
      <article className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex h-11 items-center text-sm text-gold-deep underline">
          ← Back to Nou Paint
        </Link>
        <h1 className="mt-4 font-display text-4xl text-gold-deep">{title}</h1>
        <p className="mt-1 text-sm text-muted">{updated}</p>
        {IS_DRAFT_BUILD && (
          <p className="mt-4 rounded-md border border-ink/30 bg-paper p-3 text-sm" data-testid="legal-draft-note">
            Draft: placeholders are in [SQUARE BRACKETS]. This text has not been reviewed by a solicitor and
            is not final. Preview and development builds only.
          </p>
        )}
        <div className="legal mt-6 space-y-5 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:space-y-1">
          {children}
        </div>
      </article>
    </main>
  );
}
