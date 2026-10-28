import { SAMPLE_REGIONS } from "./sample";
import type { Region } from "./regions";

export type Audience = "all" | "child" | "adult";
/** "easy" is kept for the existing child pages; Calm, Dreamy and Intricate grade the adult pages. */
export type Difficulty = "easy" | "calm" | "dreamy" | "intricate";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  calm: "Calm",
  dreamy: "Dreamy",
  intricate: "Intricate",
};

/** "image": JPEG modes (freeform and square grid). "regions": numbered SVG region painter. */
export type PageFormat = "image" | "regions";

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
  /** How the page is painted. Defaults to "image". */
  format?: PageFormat;
  /**
   * Regions built into the app, for a FREE region page. A premium region page has none:
   * its SVG is only ever delivered by /api/page/:id to an entitled browser.
   */
  regions?: readonly Region[];
  /** Pack that unlocks this page (premium pages only). */
  packId?: PackId;
  /** Public image for the gallery card. For premium pages this is a small blurred teaser, never the original. */
  teaser?: string;
  title: string;
  line: string;
  audience: Audience;
  difficulty: Difficulty;
  ready: boolean;
  /** Public image for the gallery card (not needed for inline region pages). */
  art: string;
  /** Where the page's image or SVG is loaded from. In Square (mosaic) mode this colour image is sampled for the palette. */
  source: string;
  /**
   * The line-art file Freeform painting uses for the page itself and its walls (the dark lines the fill stops at).
   * Premium: the same entitlement-checked route (`?kind=line`). Absent = use `source`.
   */
  lineSource?: string;
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
    id: "shapes",
    title: "Little garden",
    line: "Big, calm shapes: sky, hills, cypress trees and a bird.",
    audience: "all",
    difficulty: "calm",
    format: "regions",
    regions: SAMPLE_REGIONS,
    ready: true,
    art: "",
    source: "",
    colors: 12,
    grid: 0,
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
    lineSource: "/api/page/simorgh?kind=line",
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
    lineSource: "/pages/pomegranate-line.jpg",
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
    lineSource: "/pages/nightingale-line.jpg",
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
    lineSource: "/api/page/garden?kind=line",
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
