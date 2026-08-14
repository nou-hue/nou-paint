import { useEffect, useRef } from "react";
import {
  drawContained,
  fillCell,
  floodFill,
  floodSimilar,
  loadImage,
  stampPencil,
} from "@/lib/paint/engine";
import type { PaintStyle, PaintTool } from "@/lib/paint/store";

type Props = {
  src: string;
  color: string;
  tool: PaintTool;
  style: PaintStyle;
  mosaic: number;
};

export function UploadBoard({ src, color, tool, style, mosaic }: Props) {
  const lineRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const walls = useRef<ImageData | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    let gone = false;
    const line = lineRef.current;
    const paint = paintRef.current;
    if (!line || !paint) return;
    const parent = line.parentElement;
    if (!parent) return;
    const size = Math.min(parent.clientWidth, 760);
    line.width = paint.width = size;
    line.height = paint.height = size;

    loadImage(src)
      .then((img) => {
        if (gone) return;
        const lctx = line.getContext("2d");
        const pctx = paint.getContext("2d");
        if (!lctx || !pctx) return;
        drawContained(lctx, img, size, size, img.naturalWidth, img.naturalHeight);
        walls.current = lctx.getImageData(0, 0, size, size);
        pctx.clearRect(0, 0, size, size);
      })
      .catch(() => undefined);

    return () => {
      gone = true;
    };
  }, [src]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = paintRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * c.width),
      y: Math.floor(((e.clientY - r.top) / r.height) * c.height),
    };
  }

  function apply(e: React.PointerEvent<HTMLCanvasElement>) {
    const paint = paintRef.current;
    const pctx = paint?.getContext("2d");
    if (!paint || !pctx) return;
    const { x, y } = pos(e);

    if (tool === "pencil" || (tool === "erase" && style === "freeform" && e.buttons)) {
      stampPencil(pctx, x, y, color, tool === "erase" ? 14 : 7, tool === "erase");
      return;
    }

    const img = pctx.getImageData(0, 0, paint.width, paint.height);
    if (style === "mosaic") {
      fillCell(img, walls.current, x, y, mosaic, color, tool === "erase");
    } else if (walls.current) {
      const n = floodFill(img, walls.current, x, y, color, tool === "erase" ? "erase" : tool === "wash" ? "wash" : "fill");
      if (n === 0) floodSimilar(img, x, y, color, 42);
    }
    pctx.putImageData(img, 0, 0);
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-xl bg-paper shadow-[var(--shadow-border)]">
      <canvas ref={lineRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={paintRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          drawing.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          apply(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          if (tool === "pencil" || tool === "erase") apply(e);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
    </div>
  );
}
