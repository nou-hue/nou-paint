import { useMemo, useState } from "react";
import { SAMPLE_REGIONS, SAMPLE_VIEWBOX } from "@/lib/paint/sample";
import { STUDIO_PALETTE } from "@/lib/paint/palette";
import { cn } from "@/lib/utils";

type Props = {
  color: string;
  tool: "fill" | "wash" | "pencil" | "erase";
  showNumbers: boolean;
};

export function SampleBoard({ color, tool, showNumbers }: Props) {
  const [fills, setFills] = useState<Record<string, string>>({});

  const painted = useMemo(
    () => SAMPLE_REGIONS.filter((r) => fills[r.id]).length,
    [fills],
  );

  function onRegion(id: string) {
    setFills((prev) => {
      const next = { ...prev };
      if (tool === "erase") delete next[id];
      else next[id] = color;
      return next;
    });
  }

  return (
    <div className="relative mx-auto w-full max-w-[760px]">
      <svg
        viewBox={SAMPLE_VIEWBOX}
        className="block h-auto w-full rounded-xl bg-paper shadow-[var(--shadow-border)]"
        role="img"
        aria-label="Nightingale garden colouring page"
      >
        <rect x="40" y="40" width="720" height="720" rx="8" fill="#f7f1e8" />
        {SAMPLE_REGIONS.map((r) => {
          const fill = fills[r.id];
          const wash = tool === "wash" && fill;
          return (
            <path
              key={r.id}
              d={r.d}
              fill={fill ?? "#f7f1e8"}
              fillOpacity={wash ? 0.82 : 1}
              stroke="#2c261e"
              strokeWidth={2.2}
              strokeLinejoin="round"
              className="cursor-pointer"
              onClick={() => onRegion(r.id)}
            />
          );
        })}
        {showNumbers &&
          SAMPLE_REGIONS.map((r) =>
            fills[r.id] ? null : (
              <text
                key={`n-${r.id}`}
                x={r.cx}
                y={r.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#2c261e"
                fillOpacity={0.45}
                fontSize={r.n < 10 ? 18 : 16}
                fontFamily="Figtree, sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {r.n}
              </text>
            ),
          )}
      </svg>
      <p className="mt-3 text-center text-sm tabular-nums text-muted">
        {painted} / {SAMPLE_REGIONS.length} regions
      </p>
      <p className="sr-only">
        Palette map:{" "}
        {STUDIO_PALETTE.slice(0, 12)
          .map((c) => `${c.id} ${c.name}`)
          .join(", ")}
      </p>
    </div>
  );
}

export function SampleThumb({ className }: { className?: string }) {
  return (
    <svg viewBox={SAMPLE_VIEWBOX} className={cn("h-full w-full", className)} aria-hidden>
      <rect width="800" height="800" fill="#f3eee6" />
      {SAMPLE_REGIONS.map((r) => (
        <path key={r.id} d={r.d} fill="#f7f1e8" stroke="#2c261e" strokeWidth={3} />
      ))}
    </svg>
  );
}
