export type Audience = "all" | "child" | "adult";
export type Difficulty = "easy" | "dreamy";

/**
 * A purchasable pack of premium pages. TEST DATA ONLY: the "dreamy-test" pack is
 * the two adult pages that already exist, not final content, and its price is
 * a Stripe TEST Price chosen by STRIPE_PRICE_ID (nothing is priced in code).
 */
export type PackId = "dreamy-test";

export type PackDef = {
  id: PackId;
  title: string;
  /** Names of the pages in the pack, for the pre-order summary. */
  pageIds: string[];
};

export const PACKS: Record<PackId, PackDef> = {
  "dreamy-test": {
    id: "dreamy-test",
    title: "Dreamy test pack",
    pageIds: ["simorgh", "garden"],
  },
};

export function isPackId(x: unknown): x is PackId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(PACKS, x);
}

export type StudioPage = {
  id: string;
  /** Premium pages are only served by /api/page/:id to an entitled browser. Free pages are public files. */
  premium?: boolean;
  /** Pack that unlocks this page (premium pages only). */
  packId?: PackId;
  /** Public image for the gallery card. For premium pages this is a small blurred teaser, never the original. */
  teaser?: string;
  title: string;
  line: string;
  audience: Audience;
  difficulty: Difficulty;
  ready: boolean;
  art: string;
  source: string;
  colors: number;
  grid: number;
};

export const STUDIO_PAGES: StudioPage[] = [
  {
    id: "sample",
    title: "Moonlit rose garden",
    line: "A nightingale among numbered roses.",
    audience: "all",
    difficulty: "easy",
    ready: true,
    art: "/pages/sample-done.jpg",
    source: "/pages/sample-garden.jpg",
    colors: 10,
    grid: 28,
  },
  {
    id: "simorgh",
    premium: true,
    packId: "dreamy-test",
    title: "Simorgh",
    line: "The mythic bird of Persian stories.",
    audience: "adult",
    difficulty: "dreamy",
    ready: true,
    art: "/pages/preview/simorgh.jpg",
    teaser: "/pages/preview/simorgh.jpg",
    source: "/api/page/simorgh",
    colors: 14,
    grid: 36,
  },
  {
    id: "pomegranate",
    title: "Pomegranate tree",
    line: "Large fruit, a small bird, gentle shapes.",
    audience: "child",
    difficulty: "easy",
    ready: true,
    art: "/pages/pomegranate-paint.jpg",
    source: "/pages/pomegranate-paint.jpg",
    colors: 8,
    grid: 22,
  },
  {
    id: "nightingale",
    title: "Nightingale & roses",
    line: "A single bird among open petals.",
    audience: "all",
    difficulty: "dreamy",
    ready: true,
    art: "/pages/nightingale-paint.jpg",
    source: "/pages/nightingale-paint.jpg",
    colors: 12,
    grid: 32,
  },
  {
    id: "garden",
    premium: true,
    packId: "dreamy-test",
    title: "Cypress garden",
    line: "Fountain, path, and two quiet trees.",
    audience: "adult",
    difficulty: "dreamy",
    ready: true,
    art: "/pages/preview/garden.jpg",
    teaser: "/pages/preview/garden.jpg",
    source: "/api/page/garden",
    colors: 14,
    grid: 36,
  },
  {
    id: "child-card",
    title: "Bird & fruit",
    line: "A first page for young painters.",
    audience: "child",
    difficulty: "easy",
    ready: true,
    art: "/pages/card-child.jpg",
    source: "/pages/card-child.jpg",
    colors: 8,
    grid: 20,
  },
];

/** Kids collection: free pages only, never anything premium. */
export function pagesForAge(age: "child" | "adult"): StudioPage[] {
  if (age === "child") {
    return STUDIO_PAGES.filter((p) => !p.premium && (p.audience === "child" || p.audience === "all"));
  }
  return STUDIO_PAGES;
}

export function pageById(id: string) {
  return STUDIO_PAGES.find((p) => p.id === id);
}

/** Pages a collection shows. The collection is a preference, never an entitlement. */
export function pageIsPremium(id: string): boolean {
  return pageById(id)?.premium === true;
}

export function packForPage(id: string): PackId | null {
  const page = pageById(id);
  return page?.premium && page.packId ? page.packId : null;
}
