# Design critique and polish pass

Scope: draft PR, Preview and test mode only. Judged on the **current fixtures** (six pages, placeholder artwork and copy, test-mode paywall). Nothing here assumes a final library.

Screenshots (390×844 and 1280×800, light and dark, before = `d2fbf5b`, after = this branch):
`/workspace/screens/nou-paint/before/`, `/workspace/screens/nou-paint/after/`, summary `/workspace/screens/nou-paint/before-after.png`.
The "before" dark shots are identical to light, because the old build had no dark mode.

## How it compared (honest version)

| | Lake | Pigment | Happy Color | Recolor | Nou Paint **before** | Nou Paint **now** |
|---|---|---|---|---|---|---|
| Feel of a tap | soft, ambient | crisp, tool-like | instant pop + number pulse | instant pop | flat colour swap, no feedback | radial reveal clipped to the region, spring bloom, count badge, light haptic |
| Zoom and pan | pinch, smooth | pinch, smooth | pinch, smooth | pinch, smooth | `-`/`+` buttons only, page scrolled | pinch, two-finger pan, wheel, double-tap, keyboard, glides back |
| Finishing | gentle reveal, share | reveal, share | confetti, timelapse | confetti, share | progress number only | milestones at 25/50/75%, completion dialog with confetti, "See your picture" |
| Palette | floating, big dots | floating, counts | strip, remaining count | strip, remaining count | wrapped grid of swatches that pushed the canvas down | single glass dock with remaining count per colour, finished colours get a tick |
| Dark mode | yes | yes | no | yes | none | system setting plus a toggle, no flash on load |
| Type | custom, calm | custom | system | system | webfonts from a third-party-style package, static weights | self-hosted variable fonts (Figtree, Cormorant), tighter scale |
| Audience safety | adults | adults | all ages, ads | all ages, ads | strong (no tracking, gate) | unchanged, and haptics are off for children |

### Where we fell short
1. **No feedback on a tap.** The competitors all make the fill the reward. Ours changed a colour and nothing else. *Fixed* (radial reveal, bloom, ring, haptic, count badge).
2. **The canvas competed with the controls.** On a phone the swatch grid, hint and buttons pushed the artwork below the fold and the page scrolled while you painted. *Fixed*: one-screen layout, the board is capped to the viewport, controls live in a bottom dock.
3. **Zoom was a button, not a gesture.** Fine detail regions need pinch. *Fixed* (see Motion and gestures).
4. **No finish line.** Progress was a bare percentage. *Fixed*: ring, milestones, celebration.
5. **Flat surfaces.** Everything was one beige with hairlines, no depth, no dark mode. *Fixed*: tokens, layered surfaces, glass where supported with a solid fallback.
6. **Paywall and dialogs looked like a different app.** *Fixed*: same card, type and spacing as the rest.

### Where we are still behind (not fixed here)
- **Library size and daily content.** Lake and Pigment win on volume; we have six fixtures. A content question, not a design one.
- **No share or time-lapse replay.** Recolor and Happy Color have both. The history needed for a replay exists in the store, but a replay view and a kid-safe share story have not been designed. Left out on purpose rather than half-built.
- **Mosaic (square grid) mode is the oldest code.** It got the dock, theme and the zoom control, but not the radial reveal, pinch or haptics, because it paints on a `<canvas>`, not SVG regions. Moving it to the same engine is the next step.
- **No sound.** Lake leans on it. Left off: the audience includes children and shared devices.
- **Flat fills only.** Pigment has pencils, gradients and textures. Out of scope for numbered regions.

## Decisions

- **Spring motion, compositor-only.** Every animation and transition uses `transform` and `opacity` only. Springs are CSS `linear()` curves with a cubic-bezier fallback. Entrance animations use `backwards` fill so hover and press transforms keep working.
- **Haptics are a courtesy, not a feature.** `navigator.vibrate`, feature-detected, off under reduced motion, **off for children and for an unknown age** (no vibration before the grown-up choice). Patterns are all at most 200 ms in total. iOS Safari has no Vibration API, so iPhone users get the visuals only.
- **Reduced motion.** A global `prefers-reduced-motion: reduce` block removes every animation and transition and the press and lift transforms. The painter also skips the bloom, the reveal glide and confetti through `usePrefersReducedMotion()`.
- **Dark mode.** `prefers-color-scheme` by default, plus a toggle that stores one local key (`nou-theme`). A tiny inline script sets `data-theme` before paint. The artwork's paper stays paper in both themes, so colours are judged on the same ground.
- **Glass with a fallback.** `backdrop-filter` only inside `@supports`; otherwise the same surface is solid. Glass never carries text that needs more contrast than the solid version.
- **Typography.** Figtree Variable for UI and Cormorant Garamond Variable for headings, self-hosted from the bundle (strict self-only CSP; no font CDN). Great Vibes stays for the logotype only.
- **Bold calls.** The hint pill moved off the artwork. The palette moved to a bottom dock. The paper is framed like a print. The completion moment is an event, not a number.

## Accessibility (kept, and extended to dark)
- Contrast is tested, not eyeballed: text and the focus ring in **both** themes (`tests/a11y.test.ts`).
- Every control is 44 px or larger (`tests/region-painter-ui.test.tsx`).
- Keyboard: the painter is one focusable `application` surface (arrows, Enter/Space, `+`/`-`, `0`); the confetti is `aria-hidden`; progress is announced politely.
- Reduced motion and haptics guards: `tests/haptics.test.ts`, `tests/motion.test.ts`. The motion test also fails the build if any `@keyframes` or `transition` touches a property other than `transform` or `opacity`.

## Checks run
`npm run typecheck`, `npm run build`, `npm test` (node:test 14, vitest 218), `npm run lint` (0 errors). The pinch gesture was also exercised in Chrome with real touch events (two-finger spread to 3×, then a one-finger pan; no region was painted by accident).
