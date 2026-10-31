import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Heart, Leaf, Lock, Palette } from "lucide-react";
import { DIFFICULTY_LABEL, pagesForAge } from "@/lib/paint/catalog";
import { RegionThumb } from "@/components/RegionPainter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppStore } from "@/lib/paint/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const age = useAppStore((s) => s.age);
  const setAge = useAppStore((s) => s.setAge);

  return (
    <main id="main" className="damask relative min-h-dvh">
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <div className="mx-auto max-w-5xl px-5 pb-12 pt-6 sm:px-8">
        <div className="anim-rise mt-8 text-center">
          <div className="mx-auto mb-2 h-6 w-16 text-gold">
            <svg viewBox="0 0 64 24" className="h-full w-full" aria-hidden>
              <path d="M32 2c0 6-3 10-8 12 5 2 8 6 8 12 0-6 3-10 8-12-5-2-8-6-8-12z" fill="currentColor" />
            </svg>
          </div>
          <h1 className="font-script text-[4.6rem] leading-none text-gold-deep sm:text-[6rem]">
            Nou Paint
          </h1>
          <p className="mt-3 text-overline uppercase text-gold">
            Dreamy Persian paint-by-numbers
          </p>
        </div>

        {!age ? (
          <section className="mt-10 grid gap-5 md:grid-cols-2" aria-label="Choose a collection">
            <CollectionCard
              index={1}
              title="Children"
              badge="Play Free"
              image="/pages/card-child.jpg"
              caption="Playful tales. Beautiful colors. Just for young dreamers."
              onPick={() => setAge("child")}
            />
            <CollectionCard
              index={2}
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

        <footer className="mt-12 flex flex-wrap items-center justify-center gap-6 text-overline uppercase text-gold">
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
        <nav aria-label="Legal" className="mt-6 flex justify-center gap-2 text-callout text-muted">
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
  index,
  title,
  badge,
  image,
  caption,
  onPick,
}: {
  index: number;
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
      className="card lift anim-rise overflow-hidden text-left"
      style={{ ["--i" as string]: index }}
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="font-display text-2xl text-teal">{title}</p>
        <span className="rounded-full bg-paper px-3 py-1 text-caption font-medium text-gold-deep">{badge}</span>
      </div>
      <div className="px-4 pt-3">
        <img
          src={image}
          alt=""
          className="aspect-[4/5] w-full rounded-[22px] object-cover outline outline-1 -outline-offset-1 outline-ink/10"
          loading="eager"
        />
      </div>
      <p className="px-5 py-4 text-callout text-muted">{caption}</p>
    </button>
  );
}

function Gallery({ age, onSwitch }: { age: "child" | "adult"; onSwitch: () => void }) {
  const pages = pagesForAge(age);
  const navigate = useNavigate();

  return (
    <section className="mt-10">
      <div className="mb-2 text-center">
        <h2 className="anim-rise font-display text-title text-gold-deep">My Dreamy Pages</h2>
        <p className="mt-1 text-callout text-muted">
          {age === "child"
            ? "Children · play free, no sign-up"
            : "Adults · free pages, plus paid packs for grown-ups"}
        </p>
      </div>
      <div className="mb-5 flex justify-end">
        <button type="button" onClick={onSwitch} className="press inline-flex h-11 min-w-11 items-center rounded-full px-3 text-callout text-gold-deep underline underline-offset-4">
          Change collection
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((page, idx) => (
          <Link
            key={page.id}
            to="/studio/$pageId"
            params={{ pageId: page.id }}
            className="card lift anim-rise block overflow-hidden"
            style={{ ["--i" as string]: idx + 1 }}
          >
            <div className="relative">
              {page.regions ? (
                <div className="aspect-[16/9] w-full overflow-hidden bg-paper outline outline-1 -outline-offset-1 outline-ink/10">
                  <RegionThumb regions={page.regions} className="h-full w-full object-cover" />
                </div>
              ) : (
                <img
                  src={page.art}
                  alt=""
                  className="aspect-[16/9] w-full object-cover outline outline-1 -outline-offset-1 outline-ink/10"
                />
              )}
              {page.premium && (
                <span className="glass-strong absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-caption font-semibold text-ink">
                  <Lock className="size-3" aria-hidden /> Paid pack
                </span>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-display text-2xl">{page.title}</h3>
              <p className="mt-0.5 text-callout text-muted">{page.line}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-paper px-2.5 py-1 text-caption font-medium text-gold-deep">
                  {DIFFICULTY_LABEL[page.difficulty]}
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
          className="card press anim-rise p-6 text-left"
          style={{ ["--i" as string]: pages.length + 1 }}
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
          <p className="text-overline uppercase text-gold">Your image, stays on your device</p>
          <h3 className="font-display text-2xl">Upload</h3>
          <p className="mt-1 text-callout text-muted">Turns any photo into a numbered grid.</p>
        </button>
      </div>
    </section>
  );
}
