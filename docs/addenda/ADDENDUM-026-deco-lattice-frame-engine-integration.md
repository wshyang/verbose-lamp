# ADDENDUM-026 — Deco Lattice completion: clip, nine-slice, and frame-engine integration

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-021 (the plan), ADDENDUM-024 (SVG-only port);
BUILD_PROMPT §3, §4, §7; CLAUDE.md §1, §2, §6.
**Status:** Implemented — visual check pending.

## 1. What was decided

ADDENDUM-024 ported the Deco Lattice generator as an SVG medallion only. This change finishes
the reusable parts of ADDENDUM-021 and plugs the lattice into the frame engine, so the film's
octilinear bundle style is a first-class genesis source everywhere frames are used:

| Piece | Where |
|---|---|
| Parametric clipping (Liang–Barsky, Cyrus–Beck, outside-rect polylines) | `deco-lattice/model/clip.ts` (+ test) |
| Nine-slice rectangle layout (integer periods, centred remainder, aperture) | `deco-lattice/model/nineSlice.ts` (+ test) |
| Aperture + text-slot keep-outs in the composition | `DecoLatticeRequest.aperture/textSlots` |
| Lattice → frame-rail adapter (layer→kind/z/delay mapping) | `frameGrammar/latticeAdapter.ts` (+ test) |
| New `RailKind`s `star`/`lattice`/`reed` with ranks and productions | `frameGrammar/types.ts`, `grammar.ts` |
| New genesis source `lattice` (+ composable layer, `FrameFormula.seed`) | `generative.ts buildLattice` |
| Lattice screen border (`ScreenBorderStyle.pattern: 'lattice'`) | `edgeBorder.ts`, `ScreenBorderRig` |
| Frame Studio: **Reroll pattern** (lattice only), border Poster/Lattice chips | `useFrameStudio`, `FrameStudioControl` |

## 2. Why

- The plan's promise was that one engine serves title cards, the screen border and 2D UI.
  The adapter is the single place that translates a tutorial layer into grammar kinds, so
  the renderer, intricacy ranks and elaboration all keep working unchanged. Because the
  existing generative suite parameterises over every `isGenerative` source, adding `lattice`
  to `FRAME_SOURCES` immediately subjected it to symmetry, determinism, the 1200-point
  Baroque budget, monotone levels and the minimal rank-0 frame — all green unmodified.
- Lattice specs are already full D2 frames (not right halves), so `buildLattice` skips the
  mirror step and assigns `partDir: 0` (auto-by-x parting). Used as an overlay layer, its
  `frame`-kind rails are dropped (`includePrimaryFrame: false`), matching other sources.
- Everything new is opt-in: `authored` remains the default source and `poster` the default
  border. No existing golden snapshot changed.

## 3. Deviations from ADDENDUM-021 (which won, and why)

1. **Engine location.** The plan placed the engine under `art-deco-frame/engine/decoLattice/`;
   ADDENDUM-024 already established `src/features/deco-lattice/` as a standalone feature.
   The feature stayed; integration happens through its barrel plus the adapter here.
2. **Request shape.** The shipped `DecoLatticeRequest` uses flat `hw/hh/level` (not the
   planned `halfExtent` + recipe object). Kept as-is; this change only added the optional
   `aperture`/`textSlots` keep-outs from the plan.
3. **Brass WebGL finish (§3.6) deferred.** The SVG brass treatment already ships
   (`BrassDefs`). Changing the gold shader now would invalidate the visual baseline that
   ADDENDUM-022 Phase 0 is about to capture, so the shader work is deferred until after the
   likeness gate exists. Lattice title frames render in the existing gold material.
4. **Nine-slice as layout math, not a second generator.** The shipped composition already
   handles rectangles via D2; the nine-slice module supplies the exact layout/aperture math
   (used by the lattice screen border) without replacing a working generator.

## 4. Practical impact / future reader

- Frame Studio lists **Deco Lattice** automatically as a foundation and as a layer. The
  reroll button appears only while lattice is active; its seed walk is deterministic
  (`nextPatternSeed`, no `Math.random`).
- `elaborate` caps: `star` echoes inward ×2, `lattice` adds one parallel strand, `reed`
  never elaborates (density controls it) — this is what keeps Baroque within budget.
- The scene manager and border rig explicitly preserve `seed`/`pattern`; previously both
  reconstructed style objects field-by-field, which would have silently dropped them.

## 5. Validation actually performed

- Tests first: `clip.test.ts` (20 cases incl. both windings, aperture splitting),
  `nineSlice.test.ts` (integer periods at aspects 1/2/3.2, symmetric centres, sanitised
  inputs), aperture/text-slot clearance in `composition.test.ts`, `latticeAdapter.test.ts`
  (kind mapping, ranks, productions, lattice border extents/determinism, poster default).
- The untouched generative suite covers lattice title frames (70 tests).
- `npx tsc --noEmit` ✓; `vitest run src/features/art-deco-frame src/features/deco-lattice`
  ✓ (181 tests).

**Caveat:** no browser was available in this sandbox. Type-checks and tests pass; visual
verification pending — in Frame Studio choose **Deco Lattice** as the foundation, try
**Reroll pattern**, then switch the screen border pattern to **Lattice**.
