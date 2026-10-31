import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_PATTERNS, haptic, hapticsAllowed, readHapticEnv } from "../src/lib/haptics";
import { useAppStore } from "../src/lib/paint/store";

describe("haptics policy (pure)", () => {
  const base = { hasVibrate: true, reducedMotion: false, kids: false };
  it("vibrates only when supported, motion is allowed and the visitor is a grown-up", () => {
    expect(hapticsAllowed(base)).toBe(true);
    expect(hapticsAllowed({ ...base, hasVibrate: false })).toBe(false); // iOS Safari: no Vibration API
    expect(hapticsAllowed({ ...base, reducedMotion: true })).toBe(false);
    expect(hapticsAllowed({ ...base, kids: true })).toBe(false);
  });
  it("patterns are short: nothing longer than 200ms in total", () => {
    for (const [k, p] of Object.entries(HAPTIC_PATTERNS)) {
      const total = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
      expect(total, k).toBeLessThanOrEqual(200);
    }
  });
});

describe("haptic() reads the real environment", () => {
  const vibrate = vi.fn(() => true);

  function env(opts: { vibrate?: boolean; reduced?: boolean; age?: "adult" | "child" | null }) {
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({
        matches: q.includes("reduce") ? Boolean(opts.reduced) : false,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
    vi.stubGlobal("navigator", opts.vibrate === false ? {} : { vibrate });
    useAppStore.setState({ age: opts.age === undefined ? "adult" : opts.age });
  }

  beforeEach(() => vibrate.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("fires for an adult with no reduced-motion preference", () => {
    env({});
    expect(haptic("fill")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.fill);
  });

  it("is silent under prefers-reduced-motion: reduce", () => {
    env({ reduced: true });
    expect(readHapticEnv().reducedMotion).toBe(true);
    expect(haptic("fill")).toBe(false);
    expect(haptic("complete")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("is silent when navigator.vibrate does not exist, and does not throw", () => {
    env({ vibrate: false });
    expect(() => haptic("select")).not.toThrow();
    expect(haptic("select")).toBe(false);
  });

  it("is silent in kids mode and before the grown-up choice is made", () => {
    env({ age: "child" });
    expect(haptic("fill")).toBe(false);
    env({ age: null });
    expect(haptic("fill")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("swallows a vibrate() that throws", () => {
    env({});
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(haptic("undo")).toBe(false);
  });
});
