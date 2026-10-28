import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Heart, Leaf, Lock, Palette } from "lucide-react";
import { pagesForAge } from "@/lib/paint/catalog";
import { useAppStore } from "@/lib/paint/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const age = useAppStore((s) => s.age);
  const setAge = useAppStore((s) => s.setAge);

  return (
    <main id="main" className="damask min-h-dvh">
      <div className="mx-auto max-w-5xl px-5 pb-12 pt-6 sm:px-8">
        <div className="mt-8 text-center">
          <div className="mx-auto mb-2 h-6 w-16 text-gold">
            <svg viewBox="0 0 64 24" className="h-full w-full" aria-hidden>
              <path d="M32 2c0 6-3 10-8 12 5 2 8 6 8 12 0-6 3-10 8-12-5-2-8-6-8-12z" fill="currentColor" />
            </svg>
          </div>
          <h1 className="font-script text-[4.4rem] leading-none text-gold-deep sm:text-[5.6rem]">
            Nou Paint
          </h1>
          <p className="mt-3 text-xs tracking-[0.32em] text-gold uppercase">
            Dreamy Persian paint-by-numbers
          </p>
        </div>

        {!age ? (
          <section className="mt-10 grid gap-5 md:grid-cols-2">
            <CollectionCard
              title="Children"
              badge="Play Free"
              image="/pages/card-child.jpg"
              caption="Playful tales. Beautiful colors. Just for young dreamers."
              onPick={() => setAge("child")}
            />
            <CollectionCard
              title="Adults"
              badge="Dreamy collection"
              image="/pages/card-adult.jpg"
              caption="Intricate Persian art. For mindful moments and dreamers at heart."
              onPick={() => setAge("adult")}
            />
          </section>
        ) : (
          <Gallery age={age} onSwitch={() => setAge(null)} />
        )}

        <footer className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs tracking-[0.16em] text-gold uppercase">
          <span className="inline-flex items-center gap-2">
            <Leaf className="size-4" /> Mindful & relaxing
          </span>
          <span className="inline-flex items-center gap-2">
            <Palette className="size-4" /> Beautiful Persian art
          </span>
          <span className="inline-flex items-center gap-2">
            <Heart className="size-4" /> Made to inspire
          </span>
        </footer>
        <nav aria-label="Legal" className="mt-6 flex justify-center gap-2 text-sm text-muted">
          <Link to="/privacy" className="inline-flex h-11 min-w-11 items-center px-3 underline">
            Privacy
          </Link>
          <Link to="/terms" className="inline-flex h-11 min-w-11 items-center px-3 underline">
            Terms
          </Link>
        </nav>
      </div>
    </main>
  );
}

function CollectionCard({
  title,
  badge,
  image,
  caption,
  onPick,
}: {
  title: string;
  badge: string;
  image: string;
  caption: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="overflow-hidden rounded-[28px] bg-surface text-left shadow-[var(--shadow-border)] transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="font-display text-xl text-teal">{title}</p>
        <span className="rounded-full bg-paper px-3 py-1 text-xs text-gold-deep">{badge}</span>
      </div>
      <div className="px-4 pt-3">
        <img
          src={image}
          alt=""
          className="aspect-[4/5] w-full rounded-[22px] object-cover outline outline-1 -outline-offset-1 outline-ink/10"
        />
      </div>
      <p className="px-5 py-4 text-sm text-muted">{caption}</p>
    </button>
  );
}

function Gallery({ age, onSwitch }: { age: "child" | "adult"; onSwitch: () => void }) {
  const pages = pagesForAge(age);
  const navigate = useNavigate();

  return (
    <section className="mt-10">
      <div className="mb-2 text-center">
        <h2 className="font-display text-4xl text-gold-deep">My Dreamy Pages</h2>
        <p className="mt-1 text-sm text-muted">
          {age === "child"
            ? "Children · play free, no sign-up"
            : "Adults · free pages, plus paid packs for grown-ups"}
        </p>
      </div>
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={onSwitch} className="inline-flex h-11 min-w-11 items-center px-3 text-sm text-gold-deep underline underline-offset-4">
          Change collection
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((page) => (
          <Link
            key={page.id}
            to="/studio/$pageId"
            params={{ pageId: page.id }}
            className="overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-border)]"
          >
            <div className="relative">
              <img
                src={page.art}
                alt=""
                className="aspect-[16/9] w-full object-cover outline outline-1 -outline-offset-1 outline-ink/10"
              />
              {page.premium && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink">
                  <Lock className="size-3" aria-hidden /> Paid pack
                </span>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-display text-2xl">{page.title}</h3>
              <p className="mt-0.5 text-sm text-muted">{page.line}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-paper px-2.5 py-1 text-xs text-gold-deep">
                  {page.difficulty === "easy" ? "Easy" : "Dreamy"}
                </span>
                <span className="flex gap-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className={cn("size-1.5 rounded-full", i === 0 ? "bg-gold" : "bg-line")} />
                  ))}
                </span>
              </div>
            </div>
          </Link>
        ))}
        <button
          type="button"
          className="overflow-hidden rounded-[24px] bg-surface p-6 text-left shadow-[var(--shadow-border)]"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = () => {
              const f = input.files?.[0];
              if (!f) return;
              sessionStorage.setItem("nou-upload", URL.createObjectURL(f));
              void navigate({ to: "/studio/$pageId", params: { pageId: "upload" } });
            };
            input.click();
          }}
        >
          <p className="text-xs tracking-wide text-gold uppercase">Your image, stays on your device</p>
          <h3 className="font-display text-2xl">Upload</h3>
          <p className="mt-1 text-sm text-muted">Turns any photo into a numbered grid.</p>
        </button>
      </div>
    </section>
  );
}
