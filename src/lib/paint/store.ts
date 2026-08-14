import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgeMode = "child" | "adult";
export type PaintStyle = "freeform" | "mosaic";
export type PaintTool = "fill" | "wash" | "pencil" | "erase";

type AppStore = {
  age: AgeMode | null;
  setAge: (age: AgeMode | null) => void;
  style: PaintStyle;
  setStyle: (style: PaintStyle) => void;
  tool: PaintTool;
  setTool: (tool: PaintTool) => void;
  color: string;
  setColor: (color: string) => void;
  mosaic: number;
  setMosaic: (n: number) => void;
  adultUnlocked: boolean;
  unlockAdult: () => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      age: null,
      setAge: (age) => set({ age }),
      style: "mosaic",
      setStyle: (style) => set({ style }),
      tool: "fill",
      setTool: (tool) => set({ tool }),
      color: "#d4a39a",
      setColor: (color) => set({ color }),
      mosaic: 28,
      setMosaic: (n) => set({ mosaic: n }),
      adultUnlocked: false,
      unlockAdult: () => set({ adultUnlocked: true }),
    }),
    { name: "nou-paint" },
  ),
);
