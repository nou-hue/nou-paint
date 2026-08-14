export type Audience = "all" | "child" | "adult";

export type StudioPage = {
  id: string;
  title: string;
  line: string;
  audience: Audience;
  ready: boolean;
  art?: string;
};

export const STUDIO_PAGES: StudioPage[] = [
  {
    id: "sample",
    title: "Moonlit rose garden",
    line: "Dreams · 22",
    audience: "all",
    ready: true,
    art: "/pages/sample-garden.jpg",
  },
  {
    id: "soon-cypress",
    title: "Cypress walk",
    line: "Placeholder",
    audience: "adult",
    ready: false,
  },
  {
    id: "soon-fruit",
    title: "Pomegranate tree",
    line: "Placeholder",
    audience: "child",
    ready: false,
  },
  {
    id: "soon-simorgh",
    title: "Simorgh",
    line: "Placeholder",
    audience: "adult",
    ready: false,
  },
];

export function pagesForAge(age: "child" | "adult"): StudioPage[] {
  if (age === "child") {
    return STUDIO_PAGES.filter((p) => p.audience === "child" || p.audience === "all");
  }
  return STUDIO_PAGES;
}
