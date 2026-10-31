import { useEffect, useId, useRef, useState } from "react";
import { checkAnswer, makeChallenge, type GateChallenge } from "@/lib/gate";

type Props = {
  /** What the grown-up is about to do, e.g. "buy a pack" or "open a website". */
  purpose: string;
  onPass: () => void;
  onCancel: () => void;
};

/** Modal "grown-ups only" check. Re-asked every time; nothing is stored. */
export function ParentalGate({ purpose, onPass, onCancel }: Props) {
  const [challenge, setChallenge] = useState<GateChallenge>(() => makeChallenge());
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (checkAnswer(challenge, value)) {
      onPass();
      return;
    }
    setWrong(true);
    setValue("");
    setChallenge(makeChallenge());
    inputRef.current?.focus();
  }

  return (
    <div
      className="scrim anim-fade fixed inset-0 z-50 grid place-items-center px-6"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="parental-gate"
        onSubmit={submit}
        className="anim-sheet glass-strong w-full max-w-sm rounded-[32px] p-6"
      >
        <h2 id={titleId} className="font-display text-2xl">
          Grown-ups only
        </h2>
        <p className="mt-2 text-callout text-muted">
          Please ask a grown-up to answer this before you {purpose}.
        </p>
        <label className="mt-4 block text-base font-medium" htmlFor={`${titleId}-answer`}>
          {challenge.question}
        </label>
        <input
          id={`${titleId}-answer`}
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={wrong}
          aria-describedby={wrong ? `${titleId}-err` : undefined}
          className="field mt-2 h-12 w-full rounded-2xl px-4 text-lg"
        />
        {wrong && (
          <p id={`${titleId}-err`} role="alert" className="anim-nudge mt-2 text-callout text-ink">
            That is not right. Here is a new one.
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button type="submit" className="press h-12 min-w-11 flex-1 rounded-full bg-accent px-4 font-semibold text-accent-fg">
            Continue
          </button>
          <button type="button" className="press h-12 min-w-11 rounded-full px-4 text-callout text-muted" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
