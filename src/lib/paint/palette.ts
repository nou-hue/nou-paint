export const STUDIO_PALETTE = [
  { id: 1, hex: "#d4a39a", name: "Rose" },
  { id: 2, hex: "#8aa090", name: "Sage" },
  { id: 3, hex: "#6e8b82", name: "Teal" },
  { id: 4, hex: "#c9bdd4", name: "Lilac" },
  { id: 5, hex: "#f6f1e6", name: "Cream" },
  { id: 6, hex: "#c47a72", name: "Clay" },
  { id: 7, hex: "#3d4d6b", name: "Dusk" },
  { id: 8, hex: "#8a6a4a", name: "Bark" },
  { id: 9, hex: "#3a3228", name: "Ink" },
] as const;

export type PaletteColor = (typeof STUDIO_PALETTE)[number];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
