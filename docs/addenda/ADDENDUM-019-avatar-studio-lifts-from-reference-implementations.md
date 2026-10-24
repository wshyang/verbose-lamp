# ADDENDUM-019 — Avatar Studio: features lifted from three reference implementations

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (visual system), §7 (interface surfaces); extends ADDENDUM-018. CLAUDE.md §1, §2, §6.
**Status:** Implemented — visual check pending (no browser in the sandbox).

## 1. Context

The plan's branch (`docs/addendum-017-gilded-avatar-studio-plan`, commit `330c509`) carries a `3 avatar studios/` folder: three independent avatar-studio builds on this same codebase. Each folder name holds the product owner's verdict:

| | Folder verdict |
|---|---|
| **A** | "good convert photo to gold colour effect (simple implementation but good colour only cheat)" |
| **B** | "good option to retain the photo without gold conversion, good backdrop options, good backdrop shimmering effects" |
| **C** | "weiling can't load, but fantastic gold conversion effect, very mid new ideated backdrop effect" |

The task was to lift what is good from each into the ADDENDUM-018 studio, keeping it modular.

## 2. Assessment and decisions

### A — the gold colour "cheat"
- **What it did:** rendered a 128-cell sprite plate. The subject was gilded by mapping each pixel's luminance onto the house gold ramp and mixing it 85 % over the original colour (`sitterColour`). There was no blur or curve, so a trace of the real colour survives under the gold.
- **Lifted:**
  - `tintImageGold(image, { rampId, strength })` in `gilded-portrait/tint.ts`: reusable, tested, one LUT read per pixel, alpha preserved.
  - A third subject finish, **Gold wash** (`'tinted'`), which uses the chosen gold tone.
- **Not lifted:** the 128 px sprite output (ours is a full-resolution composite) and its square rim (our frames already cover that).

### B — retained photo, backdrop options, shimmer
- **What it did:**
  - A natural/gilded subject toggle.
  - Five patterns, including a Deco Fan.
  - Four-tone jewel palettes.
  - Alternating hammered gold-leaf bands, guilloché enamel, bevelled cloisons and a stepped bezel.
  - A per-pixel travelling glint, precomputed in 10 phases and played ping-pong, held still under reduced motion.
- **Lifted:**
  1. **Deco Fan** as a fifth `BackdropPattern` (`patterns/fan.ts`). The exhaustive switch made the compiler demand it be wired into `fieldAt`, defaults, labels and knobs.
  2. **Jewel palettes:** B's five palettes, as `EnamelPalette.accents` in B's band order. Band colours now interpolate across `colourOne → accents → colourTwo`.
  3. **Inlay style** `'gilded-bands'` (hammered gold leaf in every other band) and a **guilloché** knob for engine-turned rings on the enamel.
  4. **Five jewel styles** (`JEWEL_BACKDROPS`) and a new **Style** row offering classic and jewel presets.
  5. **Metal-aware shimmer** (`shimmer.ts`, `useShimmerFrames`, `ShimmerCanvas`). B re-rendered the whole backdrop for every phase. Here the composite already carries a metal map, so each frame is one multiply-add per metallic pixel, and the effect is consistent across layers:
     - gold wires, leaf, rim and the outline flare;
     - enamel barely moves;
     - a gilded or washed subject catches some light;
     - natural skin never does.

     The settings are B's: a Gaussian glint 0.08 wide, travelling 1.4 diagonals per loop, played ping-pong. The changes are 12 frames instead of 10, and the still is frame 0, which is what reduced motion shows and what the PNG exports. Frames are computed 220 ms after the look settles, so dragging a slider repaints only the still.
- **Already present:** retaining the photo (the natural finish, from the plan).
- **Not lifted:** B's panel bezel (the plaque has a stepped bezel and the medallion a rim) and B's single fixed gilding preset (superseded by C below).

### C — the "fantastic" gold conversion
- **What it did:** C rebuilt the Gilded Portrait modal as the studio. The subject was gilded with the **full** gilding pipeline and **all** of its controls (finish preset, gold tone, clarity, levels, specular folds), and the whole photo was gilded *before* masking. Its Wei_Ling button pointed at `/demo/wei-ling.png`, a path the single-file build never ships, which is why it "can't load".
- **Lifted:** the full control set for **Gild subject**: preset chips (`GILDING_PRESETS`), gold-tone chips, and clarity / levels / specular-fold sliders in the Gilded Portrait studio's units (`gilding.ts`, `GildingControls.tsx`). Our pipeline already finishes the whole square before compositing, which matches C's ordering, so cut-out edges get no gilding halo.
- **Not lifted:**
  - Its backdrop (verdict "very mid").
  - Its border-colour mask fallback (ADDENDUM-017 §4.4 forbids colour guesses).
  - Its asset path. Our sample is an ES import, inlined as a data URL. `samples.ts` records why.

## 3. Compatibility and golden data

- The new spec fields (`accents`, `inlay`, `guilloche`) are optional, and their defaults (none, cloisonné, 0) take arithmetic paths identical to ADDENDUM-018. So the four classic presets render **byte-identically**: their 16×16 snapshots did not change, and neither did the composition snapshot.
- Wei_Ling still defaults to the plan's Emerald Ballroom Sunburst, natural finish and medallion. The jewel styles are one click away in the Style row.
- The avatar preview no longer uses the CSS `.gilded-portrait-sheen` sweep: it washed equally over skin and gold. The Gilded Portrait studio is unchanged.

## 4. New interface surface

- **Pure:**
  - `tintImageGold` and `DEFAULT_TINT_STRENGTH` (gilded-portrait);
  - `FanPattern`, `InlayStyle`, `JEWEL_BACKDROPS`, `BACKDROP_PRESETS`, `INLAY_LABELS`, `withInlay`, `paletteStops`, `specKnobValue` (enamel-backdrop);
  - `shimmerFrame(s)`, `glintProfile`, `withGildingTone` and `GILDING_TONE_RANGES` (avatar-studio).
- **Testids:** `backdrop-preset`, `inlay`, `guilloche`, `gilding-preset`, `gold-tone`, `gilding-clarity`, `gilding-levels`, `gilding-folds` (all `avatar-studio__…`).

## 5. Validation

- `npx tsc --noEmit` ✓ · `npm test` ✓ — **27 files / 234 tests**, up from 24 / 220. New tests cover:
  - the tint identity, its gold and trace properties, and immutability;
  - fan symmetry;
  - distinct four-tone band enamels;
  - gold-leaf bands being warm gold;
  - guilloché raising enamel variance;
  - warm wires for all ten styles;
  - shimmer never touching matte pixels or alpha, and flaring gold;
  - gilding slider mapping and clamping;
  - tinted and gilded finishes differing only inside the subject.
- `npm run build` ✓ — **1,186.31 kB** (gzip 380.12 kB), up from 1,178.57 kB.
- **Node render check (temporary, removed):**
  - The five jewel backdrops at 512² took 187–226 ms each and showed fan rays, four-tone enamel, hammered leaf bands and visible guilloché.
  - Natural, gold-wash and gilded subjects on the Peacock Deco Fan; a phase-0.5 shimmer frame brightened the gold bands and rim along the diagonal while leaving the enamel.
- **Browser not available in sandbox.** The animation timing and layout are visually unverified, as are the gilding controls on a real photo. To check, run `npm run dev` → **Avatar Studio → Show Wei_Ling**, then:
  - try each finish;
  - pick a jewel style;
  - toggle Sheen;
  - drag a slider: the still should update immediately and the glint resume shortly after.
