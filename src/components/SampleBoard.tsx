import { RegionPainter, RegionThumb } from "@/components/RegionPainter";
import { SAMPLE_REGIONS } from "@/lib/paint/sample";

/**
 * The built-in Nightingale garden, now painted by the shared region painter
 * (numbered fills, undo/redo, progress, keyboard). Kept for stories and demos;
 * the app itself opens it as the free "Little garden" page.
 */
export function SampleBoard({ selected = 0, strict = false }: { selected?: number; strict?: boolean }) {
  return <RegionPainter regions={SAMPLE_REGIONS} title="Nightingale garden" selected={selected} strict={strict} />;
}

export function SampleThumb({ className }: { className?: string }) {
  return <RegionThumb regions={SAMPLE_REGIONS} className={className} />;
}
