# ADDENDUM-015 — Gilded Portrait: assessment and plan

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (visual system, palette), §7 (interface surfaces); CLAUDE.md §2, §4, §5, §6
**Status:** Accepted (plan) — not implemented. Implementation record will be a later addendum.

## 1. Context

Goal: take any photo (passport photo, selfie, object) and make it look like solid gold,
in the same gold-on-obsidian vocabulary as the frames and the Golden QR plaque.

Scope decided with the user:

- Build as a **self-contained module, not wired into `App.tsx` yet**.
- **No background removal in the first cut**; add later (see §5).
- Privacy constraints explicitly waived by the user for this module.

Nearest sibling is `src/qr/` (ADDENDUM-013): pure layer with snapshot tests, a hook that
decides, a thin renderer, modal + launcher, one barrel. This module mirrors that shape.

## 2. Assessment — what the reference tutorials actually do

Sources: YouTube "turn any image into gold" (Photoshop, `nnIhhbdqQmQ`) and Creatively
Squared, "Turn any object into brilliant gold with Photoshop". Both reduce to one pixel
pipeline:

| Photoshop step | Math | Planned function |
|---|---|---|
| Remove background; mask Filter → Other → Minimum r=4 | alpha mask; morphological erode (choke) to kill white fringe | `mask.ts` — segmentation deferred; ship oval / rounded-rect feathered mask + `chokeMask` now |
| Camera Raw: texture, clarity, contrast, highlights | local contrast = unsharp mask with large radius | `tone.ts` `applyClarity` (separable box blur) |
| Levels, slider toward left | levels(black, white, gamma) | `tone.ts` `applyLevels` |
| Solid white fill, blend mode Color | luminance (Rec. 709) | `tone.ts` `toLuminance` |
| **Curves, up-down-up-down points** | non-monotonic tone curve | `curve.ts` `buildCurveLut` (points → 256-entry LUT, monotone-cubic segments) |
| Article: invert + Difference, merge down, repeat | fold `y = abs(2x − 1)`, applied repeatedly | `curve.ts` `foldTone(x, folds)` — same family as the curve |
| Color Lookup "Edgy Amber" + Hue/Saturation on yellows (video) / Color Balance toward yellow+red (article) | luminance → colour gradient map | `goldRamp.ts` `buildGoldRampLut(stops)` |

**Key insight.** A monotonic gold tint only reads as sepia. The metal look comes from the
**non-monotonic curve** (it manufactures fake specular bands) on top of high local
contrast. The curve / fold count is the signature knob of the module.

"Edgy Amber" is an Adobe-bundled 3DL LUT and cannot be shipped. It is replaced by a
gradient map over the palette already in use (`#8c661c → #d4af37 → #f8e29b`, plus
near-black `#2a1a06` and highlight `#fff6dc`; see `src/qr/GoldenQrDefs.tsx` and
`src/webgl/frameMaterial.ts`).

## 3. Decisions

### Rendering: pure CPU pipeline, not GLSL

- Pipeline operates on `Uint8ClampedArray` RGBA in plain TypeScript. CLAUDE.md §2 puts
  correctness in Node-testable pure code; a shader would be untestable here.
- Source images are downscaled to ≤ 1024 px long edge on load, so a full re-gild per
  slider change costs tens of milliseconds.
- Shimmer is an SVG/CSS sheen overlay on the preview, same 8 s diagonal sweep as the QR
  plaque; PNG export is the resting (static) gold.
- **Future phase (not planned now):** feed the result plus a luminance-derived normal map
  into a Three.js `MeshStandardMaterial` lit by the ballroom env map
  (`src/webgl/environment.ts`) for real view-dependent reflections in the scene.

### No new dependencies

Everything above is a few hundred lines of arithmetic. No image library is added.

### Reuse

`toSafeFileStem` from `src/qr/export.ts` is reused by adding it to the `src/qr/index.ts`
barrel (one-line change). Modal chip/field class constants and the portal / Escape /
stop-key-propagation pattern are copied from `src/qr/QrGeneratorModal.tsx`.

## 4. Module layout — `src/gilded/`

Pure (tested, `foo.ts` + `foo.test.ts`):

- `types.ts` — `RgbaImage { width, height, data: Readonly<Uint8ClampedArray> }`,
  `GildingParams` (clarity, levels, curve points / folds, ramp id, mask shape / feather /
  choke), `GildingPreset`.
- `tone.ts` — `toLuminance`, `applyLevels`, `applyClarity`, `boxBlur` (Float32, separable).
- `curve.ts` — `buildCurveLut(points)`, `foldTone`, `buildFoldLut(folds)`.
- `goldRamp.ts` — `buildGoldRampLut(stops)` → 256 × RGB; `GOLD_RAMPS` (frozen).
- `mask.ts` — `buildShapeMask({ width, height, shape, feather })`, `chokeMask(mask, radius)`.
- `fit.ts` — `fitWithin(w, h, maxEdge)` for the load-time downscale.
- `pipeline.ts` — `gildImage(image, params): RgbaImage`. Every stage returns new arrays;
  the input is never mutated. Each function ≤ 50 lines.
- `presets.ts` — frozen `as const`: "Gatsby Bullion" (2 folds, bright ramp),
  "Daisy's Locket" (oval mask, soft curve), "Jazz Age Patina" (deep ramp, low clarity),
  "Polished Trophy" (3-peak curve, high clarity).
- `validate.ts` — `validateImageFile({ type, size })` → ok | user-facing reason
  (not an image, > 25 MB, HEIC hint). Never throws.

Thin DOM (not unit-tested, per CLAUDE.md §2):

- `load.ts` — `File` → `createImageBitmap` → canvas downscale → `RgbaImage`; decode
  failure becomes user copy.
- `export.ts` — `RgbaImage` → canvas → PNG download, stem fallback `gilded-portrait`.
- `useGildedPortrait.ts` — source image, params, active preset, memoised `gildImage`,
  file handling, export.
- `GildedPortraitCanvas.tsx` — draws `RgbaImage` to `<canvas>` with the sheen overlay.
- `GildedPortraitModal.tsx` — file picker, preset chips, clarity / levels / folds sliders,
  ramp chips, mask shape, shimmer toggle, before/after toggle, download PNG.
- `GildedPortraitLauncher.tsx` — button + modal; **exported, not mounted**.
- `index.ts` — barrel with a layer-map comment like `src/qr/index.ts`.

Test IDs `gilded-portrait__{role}`: `launch`, `backdrop`, `close`, `file-input`,
`preview`, `error`, `preset`, `clarity`, `levels`, `folds`, `ramp`, `mask`, `shimmer`,
`compare`, `download-png`.

## 5. Deferred: background removal

Trigger to un-defer: user asks for subject isolation. Options assessed:

- **People only:** MediaPipe selfie segmenter (Apache-2.0, ~250 KB model plus a
  multi-MB wasm runtime). Good for selfies and passport photos; poor for objects.
  Inflates the single-file build or requires a CDN fetch.
- **Any object:** general background-removal ONNX models (~40 MB+). Licences need vetting
  (`@imgly/background-removal` is AGPL; RMBG is non-commercial).

The mask stage is designed so a segmentation alpha can replace `buildShapeMask` output
without touching the rest of the pipeline; `chokeMask` (the tutorial's Minimum r=4)
still applies.

## 6. Tests (to be written first)

- Fixtures: deterministic synthetic images (16 × 16 "studio portrait": dark backdrop,
  lit face disc, rim highlight) built in a `fixtures.ts` helper. No binary fixtures.
- `tone.test` — luminance weights; levels clamps and gamma; clarity raises local
  variance; blur preserves mean.
- `curve.test` — LUT endpoints; passes through control points; fold(0) = identity;
  fold(1) = abs(2x − 1); peak count for the non-monotonic presets.
- `goldRamp.test` — stops hit exact hexes; LUT length 768; warm hue (R ≥ G ≥ B) everywhere.
- `mask.test` — centre 255, outside 0; choke shrinks area; feather monotonic.
- `pipeline.test` — input untouched (immutability); output size equals input; alpha from
  mask; **snapshot of signature-preset LUTs and the 8 × 8 fixture output** (data, not
  screen pixels).
- `validate.test`, `fit.test`.

## 7. Practical impact

- New module `src/gilded/`; only other touch is a one-line export in `src/qr/index.ts`.
- `App.tsx` untouched (known debt per ADDENDUM-001; wiring is a separate decision).
- Implementation record will be the next addendum and must explain any deviation from
  this plan.

## 8. Validation

Plan only. Reference tutorials reviewed (video transcript supplied by the user; article
fetched). Existing code read: `src/qr/*`, `src/webgl/frameMaterial.ts`,
`docs/addenda/ADDENDUM-013-*`. No code written, so no `tsc` / `vitest` / build run.
Planned verification on implementation: `npx tsc --noEmit`, `npm test`, `npm run build`,
plus a Node render of a fixture to a PNG for eyeballing. No browser in this sandbox —
visual verification will be pending.
