# ADDENDUM-026 — Deco Lattice inside the frame grammar (ADDENDUM-021 §3.5 integration)

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-021 (plan), ADDENDUM-024 (port); BUILD_PROMPT §3, §4, §7; CLAUDE.md §1, §2, §5, §6, §7.
**Status:** Implemented in part — engine integration done; screen-border pattern and brass finish still open (§6).

## 1. What was decided

ADDENDUM-024 ported the Deco Lattice *generator* but never connected it to the frame engine, so the family was only reachable through `DecoLatticeFrame` (medallions). This change closes the title-card half of ADDENDUM-021 §3.5:

1. **`lattice` is a first-class `FrameSource`.** `FRAME_SOURCES` gains "Deco Lattice — the film's parallel-line bundles on a 45° lattice, built from a seed" (`isGenerative: true`), so it appears in Frame Studio automatically and is exercised by the existing generative suite (symmetry, determinism, vertex budget, monotone levels, closed rank-0 frame at Minimal).
2. **Two new `RailKind`s**, `strand` and `reed`, so lattice bundles and reed rows carry their own base rank (3) instead of masquerading as `pinstripe` (which would pollute the authored monogram comparison in the generative tests).
3. **`FrameFormula.seed`** (default 1925) and a **"Reroll pattern"** button (`frame-studio__reroll`) that appears only when the lattice source is active. The hook decides (`rerollPattern`); the control renders.
4. **Frame mode is now seed-sensitive.** `layer3`'s frame bracket was fixed geometry; it is now drawn from the seed (a 45° bracket placed 0.34–0.48 m in from the corner, 2–3 strands). Without this, "reroll" would have done nothing visible for a title card.

## 2. Why

- The plan's whole point was that the lattice should be *composable*: a foundation, a layer, and a Studio option, not a one-off component.
- The generative suite is the safety net the plan relies on. Making the source pass it unchanged (rather than loosening the suite) is what proves the mapping is sound.
- A reroll button that changes nothing is a lie in the UI, so the seed had to reach the frame-mode recipe.

## 3. Mapping rules (what a future reader needs)

| Lattice layer | Grammar kind | Rank consequence |
|---|---|---|
| 0 (frame bars, stepped border) | `frame` (rank 0 for the first pair, `rule` after) | dropped first by Minimal intricacy, closed rank-0 frame survives |
| 1 (octagram) | `diamond` | rank 2 |
| 2 (strand bundles, brackets) | `strand` | rank 3 |
| 3 (corner diamonds, arrows / reed ticks) | `diamond` / `reed` | rank 2 / rank 3 |

- Adapter: `engine/frameGrammar/latticeSource.ts`. It emits `PolylineSpec`s with `depth = max(width × 1.7, 0.012)`, z stepped per layer, staggered draw-on delays, and `partDir = 0` (auto by x).
- **Vertex budget:** `fitVertexBudget` drops whole rank tiers until the 1000-point cap is met. It is rank-based on purpose: index truncation would break mirror symmetry, and the generative suite checks symmetry per rail.
- `includePrimaryFrame: false` filters `frame` kinds so the source can be a composable overlay.

## 4. Snapshots that changed

- `deco-lattice/model/__snapshots__/composition.golden.test.ts.snap`: the three **frame-mode** entries (lucky-draw frame, premiere-frame, invitation-panel) changed because frame-mode layer 3 is now seeded. The **medallion** entry (Spooner, seed 1925) is byte-identical — medallion never used the bracket branch.
- No `art-deco-frame` golden changed; the lattice source is additive and `authored` remains the default.

## 5. Tests

- `latticeSource.test.ts` (22 tests): kind mapping per layer, polyline conversion (copied points, depth floor, z/delay ordering), budget behaviour (rank tiers, rank-0 floor, missing ranks, determinism), seed determinism and sensitivity, monotone levels within budget, mirror symmetry, overlay filtering, level clamping.
- The existing `generative.test.ts` loop now covers `lattice` for all five archetypes with no test edits — that is the acceptance criterion from ADDENDUM-021 §5.
- `composition.test.ts` gains a default-seed/depth equivalence test.

## 6. Not done here — and why

> **Superseded by ADDENDUM-028.** Both items below are now implemented (nine-slice
> proscenium, brass finish) and the SVG export is wired. This section is kept as
> the record of why they were deferred at the time.

Two items from ADDENDUM-021 remained open and were **not** claimed as implemented:

1. **`ScreenBorderStyle.pattern: 'poster' | 'lattice'`** (nine-slice proscenium) and the `clip.ts` / `nineSlice.ts` helpers. Reason: `buildEdgeBorder` and `ScreenBorderRig` are on the camera and cannot be judged without a browser; adding a second border geometry blind risks the one surface that is always on screen.
2. **Brass finish** (`createGoldFrameMaterial({ finish })`, `PolylineSpec.tone` → `aTone`, scratched grain, banded raking light). Reason: it changes the shader for every existing frame. The likeness gate (ADDENDUM-027) must exist before a change of that class is made, so it should be the first thing done once baselines are captured.

Also from ADDENDUM-021, the SVG export helpers for lattice frames (reusing the QR exporter) are not wired.

## 7. Validation actually performed

- `npx tsc --noEmit` ✓, `npm test` ✓ (547 tests, 70 files), `npm run build` ✓.
- **Caveat:** no browser in this sandbox. The lattice reads as octilinear geometry in the tests, not as a finished frame. Visual verification against the tutorial is pending.
