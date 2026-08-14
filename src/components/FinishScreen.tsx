import { Link } from "@tanstack/react-router";
import { Check, Download, Feather, Home, Share2, UserRound } from "lucide-react";
import { useAppStore } from "@/lib/paint/store";

type Props = {
  preview: string;
  title: string;
  onClose: () => void;
  onDownload: () => void;
};

export function FinishScreen({ preview, title, onClose, onDownload }: Props) {
  const age = useAppStore((s) => s.age) ?? "adult";

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Nou Paint", text: title });
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="damask flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-gold-deep">
          <span className="grid size-9 place-items-center rounded-full border border-gold/40 font-display text-lg">
            N
          </span>
          <span className="font-display text-2xl">Nou Paint</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full border border-gold/40 text-gold-deep"
          aria-label="Done"
        >
          <Check className="size-5" />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center px-6">
        <p className="text-[11px] tracking-[0.32em] text-gold uppercase">Finished artwork</p>
        <div className="mx-auto mt-1 h-px w-16 bg-gold/50" />

        <figure className="mt-6 w-full max-w-md rounded-[28px] border border-gold/35 bg-paper p-3 shadow-[var(--shadow-border)]">
          <img
            src={preview}
            alt={title}
            className="aspect-square w-full rounded-[20px] object-cover"
          />
        </figure>

        <div className="mt-7 grid w-full max-w-2xl grid-cols-3 gap-3">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-2xl border border-gold/25 bg-surface px-3 py-4 text-center shadow-[var(--shadow-border)]"
          >
            <Download className="mx-auto size-5 text-gold-deep" />
            <p className="mt-2 font-display text-lg text-gold-deep">Save</p>
            <p className="text-xs text-muted">{age === "child" ? "Free download" : "£1.99 to keep"}</p>
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="rounded-2xl border border-gold/25 bg-surface px-3 py-4 text-center shadow-[var(--shadow-border)]"
          >
            <Share2 className="mx-auto size-5 text-gold-deep" />
            <p className="mt-2 font-display text-lg text-gold-deep">Share</p>
            <p className="text-xs text-muted">Share your art</p>
          </button>
          <Link
            to="/"
            className="rounded-2xl border border-gold/25 bg-surface px-3 py-4 text-center shadow-[var(--shadow-border)]"
          >
            <Feather className="mx-auto size-5 text-gold-deep" />
            <p className="mt-2 font-display text-lg text-gold-deep">New page</p>
            <p className="text-xs text-muted">Create something new</p>
          </Link>
        </div>

        <p className="mt-8 text-sm tracking-wide text-gold">Your art is complete.</p>
      </div>

      <nav className="flex items-center justify-around px-8 py-5 text-gold-deep">
        <Link to="/" aria-label="Home">
          <Home className="size-5" />
        </Link>
        <span className="grid size-12 place-items-center rounded-full border border-gold/40">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path
              d="M12 4c0 5-2.4 8-6 9 3.6 1 6 4 6 9 0-5 2.4-8 6-9-3.6-1-6-4-6-9z"
              fill="currentColor"
            />
          </svg>
        </span>
        <Link to="/login" aria-label="Account">
          <UserRound className="size-5" />
        </Link>
      </nav>
    </div>
  );
}
