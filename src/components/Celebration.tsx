import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

type Props = {
  title: string;
  onSee: () => void;
  onKeepGoing: () => void;
};

const COLOURS = ["#e3bc6a", "#d4a39a", "#8fc4b4", "#c9bdd4", "#f3ebdc", "#b98f3f"];

/** A small deterministic scatter (no Math.random: same look on server and client, and testable). */
export function confettiPieces(n = 28) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.21;
    const dist = 130 + ((i * 37) % 120);
    return {
      id: i,
      dx: Math.round(Math.cos(a) * dist),
      dy: Math.round(Math.sin(a) * dist * 0.8 - 60),
      rot: ((i * 83) % 360) - 180,
      delay: (i % 7) * 28,
      colour: COLOURS[i % COLOURS.length],
      round: i % 3 === 0,
    };
  });
}

/**
 * Shown the moment a picture reaches 100%. Confetti and the glow only move under no-preference
 * (they are also hidden by the global reduced-motion CSS); the card itself is always there.
 */
export function Celebration({ title, onSee, onKeepGoing }: Props) {
  const reduced = usePrefersReducedMotion();
  const pieces = useMemo(() => confettiPieces(), []);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="scrim anim-fade fixed inset-0 z-40 grid place-items-center px-5"
      onKeyDown={(e) => {
        if (e.key === "Escape") onKeepGoing();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Picture complete"
        data-testid="celebration"
        className="anim-sheet glass-strong relative w-full max-w-sm rounded-[32px] p-7 text-center outline-none"
      >
        {!reduced && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-16" data-testid="confetti">
            {pieces.map((p) => (
              <span
                key={p.id}
                className="confetti-piece"
                style={{
                  background: p.colour,
                  borderRadius: p.round ? "999px" : "2px",
                  animationDelay: `${p.delay}ms`,
                  ["--dx" as string]: `${p.dx}px`,
                  ["--dy" as string]: `${p.dy}px`,
                  ["--rot" as string]: `${p.rot}deg`,
                }}
              />
            ))}
          </div>
        )}
        <div className="celebrate-badge mx-auto grid size-16 place-items-center rounded-full bg-accent text-accent-fg">
          <Sparkles className="size-7" aria-hidden />
        </div>
        <p className="mt-5 text-overline uppercase text-gold">Finished</p>
        <h2 className="mt-1 font-display text-4xl text-ink">Beautiful.</h2>
        <p className="mt-2 text-callout text-muted">
          {title} is complete. Every shape, painted by you.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSee}
            className="press h-12 rounded-full bg-accent px-6 text-callout font-semibold text-accent-fg"
          >
            See your picture
          </button>
          <button type="button" onClick={onKeepGoing} className="press h-11 rounded-full px-6 text-callout text-muted">
            Keep editing
          </button>
          <Link to="/" className="press inline-flex h-11 items-center justify-center rounded-full px-6 text-callout text-muted">
            Choose another page
          </Link>
        </div>
      </div>
    </div>
  );
}
