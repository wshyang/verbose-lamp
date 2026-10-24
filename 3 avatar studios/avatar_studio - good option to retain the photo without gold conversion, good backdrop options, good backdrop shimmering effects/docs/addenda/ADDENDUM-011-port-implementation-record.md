# ADDENDUM-011 — Port implementation record

**Date:** 2026-10-23 · **Relates to:** ADDENDUM-010 · **Decision Context:** DC-007
**Donor:** `wshyang/verbose-lamp@4ae6291` (`1/`)

## What landed

| Requirement | Outcome |
|---|---|
| Viewport frame | `frameGrammar/edgeBorder.ts` (ported) + `ScreenBorderRig`: unit viewport space, frustum scale `d·tan(fov/2)`, camera-parented, rebuilt on resize, rendered through our chamfered gold + trim shader. Replaced `posterBorder.ts`/`PosterBorderRig`. |
| Small overlay + dismiss/restore | `FrameStudioControl` stays a compact overlay; gained a dismiss `X` and a `Frame Studio` reopen button that appears when dismissed. `F` toggles. Independent of the HUD eye, so the timeline is never hidden with it. |
| Fine-tune proportions | 10-gene `genome.ts` + `frameDesigns.ts` gallery; hidden behind a collapsed `Fine-tune proportions` section with grouped sliders and signature ticks. Moving a slider relabels the design Custom. |
| Arrow selector removed | The ‹ label › stepper is gone; the 12-entry design gallery renders as a visible button grid. |
| Consolidation | Patterns: Sunburst (Authored), Fractal, Rosette, Arcade — all as buttons. Designs (genome settings) apply to Sunburst. Screen border has its own surface with a weight slider. Shared Reset. |

## Genes are real

`buildFrame` now threads `formula.genome` into `buildCoreFrameSpecs`. `cornerScale`,
`cornerProfile` (notch / chamfer / round), `zigguratSteps` (setback-preserving),
`rayDensity` (odd-preserving), `raySpread`, `rayReach`, `wingDelta`, `wingSweep` and
`fractalDepth`/`fractalRatio` (Cantor-dashed rules) all alter geometry. The signature
genome reproduces the delivered frame exactly — the golden snapshot still passes.

## Deviations and corrections

1. **Not ported:** `1/`'s stats readout and its second ornament family (Fluted). The readout needs geometry stats plumbed out of the manager; the Fluted family is a whole second engine. Both are noted as follow-ups rather than half-shipped.
2. **Designs apply to the Sunburst pattern only** — they are settings of the authored genome, not patterns in their own right.
3. **Two bugs caught by tests during the port:** the ziggurat rewrite dropped a corner vertex, and emit order flipped (right half must come first) — both restored before the snapshot passed.
4. **Test expectation corrected:** nested border rules are mirrored open halves meeting at the x = 0 seam, so "must be closed" was wrong; the assertion now checks the seam pair and envelope.

## Verification

`tsc` ✓ · `vitest` ✓ (5 files, 104 tests: golden unchanged, gene effect, recursion, clamping, gallery, border bounds/symmetry/density/determinism) · `build` ✓ (`dist/index.html` 907.7 kB / 244.6 kB gzip).
**No browser in this sandbox** — shader compilation, border alignment at real aspect ratios, and the collapsed-section layout remain visually unverified.
