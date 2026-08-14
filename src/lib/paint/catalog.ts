export type Audience = "all" | "child" | "adult";
export type Difficulty = "easy" | "dreamy";

export type StudioPage = {
  id: string;
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
    title: "Simorgh",
    line: "The mythic bird of Persian stories.",
    audience: "adult",
    difficulty: "dreamy",
    ready: true,
    art: "/pages/simorgh-paint.jpg",
    source: "/pages/simorgh-paint.jpg",
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
    title: "Cypress garden",
    line: "Fountain, path, and two quiet trees.",
    audience: "adult",
    difficulty: "dreamy",
    ready: true,
    art: "/pages/garden-paint.jpg",
    source: "/pages/garden-paint.jpg",
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

export function pagesForAge(age: "child" | "adult"): StudioPage[] {
  if (age === "child") {
    return STUDIO_PAGES.filter((p) => p.audience === "child" || p.audience === "all");
  }
  return STUDIO_PAGES;
}

export function pageById(id: string) {
  return STUDIO_PAGES.find((p) => p.id === id);
}
