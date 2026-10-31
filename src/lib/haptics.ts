import { prefersReducedMotion } from "@/lib/motion";
import { useAppStore } from "@/lib/paint/store";

export type HapticKind = "select" | "fill" | "wrong" | "undo" | "milestone" | "complete";

/** Short, soft patterns (ms). Vibrate once, never a buzz-storm. */
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  select: 6,
  fill: 12,
  undo: 8,
  wrong: [16, 40, 16],
  milestone: [14, 36, 14],
  complete: [18, 44, 18, 44, 36],
};

export type HapticEnv = {
  /** `navigator.vibrate` exists. iOS Safari does not have it, so there the feel is visual only. */
  hasVibrate: boolean;
  /** `prefers-reduced-motion: reduce`. Haptics are motion; off when asked. */
  reducedMotion: boolean;
  /** Child mode: no device vibration, ever. */
  kids: boolean;
};

/** The whole policy in one pure function, so it can be tested without a browser. */
export function hapticsAllowed(env: HapticEnv): boolean {
  return env.hasVibrate && !env.reducedMotion && !env.kids;
}

export function readHapticEnv(): HapticEnv {
  const hasVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  return {
    hasVibrate,
    reducedMotion: prefersReducedMotion(),
    // Unknown age counts as kids: the grown-up choice has to be made first.
    kids: useAppStore.getState().age !== "adult",
  };
}

/** Fire a pattern if (and only if) the policy allows. Returns whether the device was asked to vibrate. */
export function haptic(kind: HapticKind): boolean {
  if (!hapticsAllowed(readHapticEnv())) return false;
  try {
    return navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {
    return false;
  }
}
