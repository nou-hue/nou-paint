import { Link } from "@tanstack/react-router";
import { Check, Download, Feather, Home, Share2 } from "lucide-react";

type Props = {
  preview: string;
  title: string;
  onClose: () => void;
  onDownload: () => void;
};

export function FinishScreen({ preview, title, onClose, onDownload }: Props) {
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
          <span className="grid size-11 place-items-center rounded-full border border-gold/40 font-display text-lg">
            N
          </span>
          <span className="font-display text-2xl">Nou Paint</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="press glass grid size-12 place-items-center rounded-full text-gold-deep"
          aria-label="Done"
        >
          <Check className="size-5" />
        </button>
      </header>

      <main id="main" className="flex flex-1 flex-col items-center px-6">
        <p className="anim-rise text-overline uppercase text-gold">Finished artwork</p>
        <div className="mx-auto mt-1 h-px w-16 bg-gold/50" />

        <figure className="anim-sheet paper-frame mt-6 w-full max-w-md p-3">
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
            className="card press px-3 py-4 text-center"
          >
            <Download className="mx-auto size-5 text-gold-deep" />
            <p className="mt-2 font-display text-lg text-gold-deep">Save</p>
            <p className="text-caption text-muted">Saved to this device</p>
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="card press px-3 py-4 text-center"
          >
            <Share2 className="mx-auto size-5 text-gold-deep" />
            <p className="mt-2 font-display text-lg text-gold-deep">Share</p>
            <p className="text-caption text-muted">Share your art</p>
          </button>
          <Link
            to="/"
            className="card press px-3 py-4 text-center"
          >
            <Feather className="mx-auto size-5 text-gold-deep" />
            <p className="mt-2 font-display text-lg text-gold-deep">New page</p>
            <p className="text-caption text-muted">Create something new</p>
          </Link>
        </div>

        <p className="mt-8 text-callout text-gold">Your art is complete.</p>
      </main>

      <nav className="flex items-center justify-around px-8 py-5 text-gold-deep">
        <Link to="/" aria-label="Home" className="grid size-12 place-items-center">
          <Home className="size-5" aria-hidden />
        </Link>
        <span className="grid size-12 place-items-center rounded-full border border-gold/40">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
            <path
              d="M12 4c0 5-2.4 8-6 9 3.6 1 6 4 6 9 0-5 2.4-8 6-9-3.6-1-6-4-6-9z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="size-12" aria-hidden />
      </nav>
    </div>
  );
}
