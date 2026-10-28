# Test fixtures

`chahar-bagh-DRAFT.svg` (+ `.regions.json`) is a **DRAFT format-test sample, not content**. It exists only so the
region painter and the premium SVG route can be tested. It is never imported by `src/`, never copied to
`public/` or `private/`, and is not part of the build. A test (`tests/regions-assets.test.ts`) fails if a copy appears anywhere shipped.
