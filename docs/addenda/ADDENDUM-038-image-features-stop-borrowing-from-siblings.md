# ADDENDUM-038 — The image features stop borrowing from siblings (modularity review, Finding 5)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §7; CLAUDE.md §6; `docs/modularity-review/2026-10-26/modularity-review.md` (Issue 5); ADDENDUM-017 §3.0 (the same move for the raster types).
**Status:** Implemented. Type-checks, tests pass, coverage holds at 100 %, builds; nothing rendered in a browser (none in the sandbox), so visual verification is pending.

## 1. What was decided

Three small, generic things lived inside feature barrels that also export React modals, so `background-removal` and `enamel-backdrop` (documented as "reusable alone") could not be lifted without `gilded-portrait`, and `gilded-portrait` could not be lifted without `qr-generator`. They moved to `shared/`:

| Moved | From | To |
|---|---|---|
| `boxBlur`, `BlurOptions` (separable box blur, mean preserved) | `gilded-portrait/tone.ts` | `shared/lib/raster/blur.ts`, exported from `shared/lib/raster` |
| `GOLD_RAMPS`, `buildGoldRampLut`, `GoldRampId`, `GoldRampStop`, `GoldRampDefinition` | `gilded-portrait/goldRamp.ts` and `types.ts` | `shared/lib/goldRamp/` (the module and its three test files moved with it) |
| `toSafeFileStem` import | `gilded-portrait/export.ts` imported it from `qr-generator` | imports it from `shared/lib/svgExport`, where `qr-generator` itself got it. The `'gilded-portrait'` fallback was already passed explicitly. |

`gilded-portrait` re-exports everything it exported before (`boxBlur`, `BlurOptions`, `GOLD_RAMPS`, `buildGoldRampLut`, the three types), so no existing import of its barrel changes. `avatar-studio`, `enamel-backdrop` and `background-removal` now import the shared modules directly.

## 2. Why

The review rated this Minor: the utilities are stable, so there is little cascade, but under the reuse plan each cross-feature import through a barrel that carries React is an extraction blocker. `avatar-studio` still imports `background-removal`, `enamel-backdrop`, `face-detection` and `gilded-portrait`; that is an orchestrator composing its parts and is not changed.

## 3. Practical impact / what a future reader must know

- Behaviour is unchanged: the functions moved verbatim and the existing tests, including every `boxBlur` case in `gilded-portrait/tone*.test.ts`, pass through the re-export. `shared/lib/raster/blur.test.ts` adds direct tests for the shared module.
- `gilded-ui` has its own `GOLD_RAMPS` and `GoldRampId` (five-colour UI palettes: classic, champagne, brass, ember). They are a different thing with the same names and were deliberately **not** merged with the photo ramps (stop lists: bright, deep, champagne); merging them would change colours. `shared/lib/goldRamp/index.ts` says so.
- `gilded-portrait/tone.ts` lost its private `hasRasterShape`, which only the blur used.
- `qr-generator` still exports `toSafeFileStem`; its own tests and mock use it. Only the cross-feature import was removed.
- After this change `background-removal`, `enamel-backdrop`, `gilded-portrait` and `face-detection` import no other feature.

## 4. Validation actually performed

`npx tsc --noEmit` clean; `npm run test:coverage`: 585 files, 4310 tests pass, statements 100 % (5426), branches 100 % (1893), functions 100 % (1277), lines 100 % (4737); `npm run build` succeeds; `discipline.test.ts` and `barrels.test.ts` pass with no new debt row. `grep -rn "@/features/"` over the four image features (non-test) finds nothing. Browser, e2e and the likeness gate were not run.
