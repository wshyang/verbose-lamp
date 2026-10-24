# ADDENDUM-016 - Gilded Portrait: implementation record and verification

**Date:** 2026-10-24; relates to BUILD_PROMPT sections 3 and 7; CLAUDE.md sections 1, 2, 5, and 6
**Status:** Implemented - browser visual verification pending.

## 1. Decisions and deviations

- The feature remains self-contained. `GildedPortraitLauncher` is exported but not
  mounted by `App.tsx`; background removal remains deferred.
- The checkout already registered ADDENDUM-014 for feature-first architecture, while
  the supplied portrait plan was also numbered 014. Its registered architecture record
  was missing. The missing #014 record was restored, the plan was renumbered to #015,
  and this implementation is #016 to preserve append-only numbering.
- The module lives at `src/features/gilded-portrait/`, not the planned `src/gilded/`,
  following the committed feature-first rule in `CLAUDE.md` section 6 and
  `docs/ARCHITECTURE.md`. The QR sibling has likewise moved to
  `src/features/qr-generator/`; its barrel now exposes `toSafeFileStem` for reuse.
- `GildingParams.levels` is a 0-100 intensity. The pure pipeline maps that control to
  black point, white point, and gamma before applying the monotone-cubic curve and
  repeated fold LUTs. This keeps the modal control simple while `applyLevels` remains
  independently reusable with explicit level settings.
- Shape masks return an `AlphaMask` carrying width, height, and pixels, allowing
  `chokeMask(mask, radius)` to perform separable square-kernel erosion without hidden
  global dimensions. Feather is a fraction of the shortest image edge; choke is in
  pixels. Supported first-cut masks are full image, oval, and rounded rectangle.
- The upload flow validates MIME and 25 MB size, gives HEIC-specific guidance, and
  downsizes to a 1024 px long edge. The preview uses a CSS eight-second sheen;
  PNG export contains the still gold pixels only.
- No image-processing dependency or background-removal model was added. The missing
  repository `.gitignore` was restored for `node_modules/`, `dist/`, and `.DS_Store`.

## 2. Implementation

- Pure code in `src/features/gilded-portrait/` covers Rec. 709 luminance, separable
  mean-preserving box blur, clarity, levels, PCHIP tone curves, fold LUTs, frozen gold
  ramps, alpha masks, image fitting, presets, validation, and the immutable RGBA
  pipeline.
- Four presets are included: Gatsby Bullion, Daisy's Locket, Jazz Age Patina, and
  Polished Trophy. The signature tone LUTs and an 8 x 8 synthetic portrait result are
  protected by data snapshots.
- Thin browser adapters load local files and download PNG. The hook owns image/preset
  state and export decisions; the canvas renderer, modal, and launcher stay separate.
- The modal exposes file selection, presets, clarity/levels/folds sliders, gold ramps,
  mask shapes, sheen, before/after comparison, and PNG download. Its interactive
  elements use the `gilded-portrait__{role}` test-id convention and the shared dialog
  for portal, Escape, focus, and key propagation behavior.
- `App.tsx` is unchanged. `docs/ARCHITECTURE.md` lists the new opt-in feature.

## 3. Validation

- `npx tsc --noEmit` passed.
- `npm test` passed: 18 test files and 159 tests, including 20 new gilded-portrait
  tests and the signature LUT/pixel snapshots.
- `npm run build` passed. The single-file `dist/index.html` is 991.48 kB (272.59 kB
  gzip).
- A 64 x 64 synthetic Gatsby Bullion fixture was rendered to PNG with Node's built-in
  zlib and inspected. A warm 1024 x 1024 pipeline benchmark measured 51-54 ms after
  warmup (first runs: 82.5 and 66.9 ms) on Node 20 in this sandbox; this is an
  environment-specific measurement, not a browser performance guarantee.
- No browser is available in this sandbox. Modal layout, real-photo aesthetics, browser
  file decoding, and PNG download behavior remain visually and cross-browser unverified.