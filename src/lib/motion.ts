import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the visitor asked the OS for less motion. SSR and old browsers: false (CSS still guards). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

/** Live value; follows the OS setting while the page is open. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
