# ADDENDUM-031 — Deco Lattice integration (Phase 4)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §5, §7; CLAUDE.md §2, §5, §6, §7. Implements ADDENDUM-021 (the plan) as integrated by ADDENDUM-027. Builds on ADDENDUM-025/026 (nothing shader-file related changed here; the brass finish is injected text, see §5).
**Status:** Implemented and unit-tested. **The brass look has never been rendered by a GPU or seen by a person;** it is verified only as injected shader text and as material parameters. Visual verification pending.

## 1. What was decided / done

| Item | Where | Base | Taken from the others |
|---|---|---|---|
| Walk fix | `deco-lattice/model/walk.ts` | PR #6 (`stepRun` only reads `occupied`; footprint reserved when the walk ends) | PRs #2/#3 produce the same medallion counts, which cross-validates it |
| Clipping | `model/clip.ts` | PR #5 (Liang-Barsky + Cyrus-Beck, closed loops stay closed) | PR #2's edge-case assertions; its query-object API and unused `segmentIntersectsRect` were not taken |
| Nine-slice | `model/nineSlice.ts`, `reedRow({ count })` | PR #6 (repeat count first, integral by construction, aperture-aware) | PR #5's layout suite as cross-checks; one found a NaN leak (see §3) |
| Tone | `model/tone.ts` | PR #6 (untested there) | tests are new |
| Screen-border proscenium | `frameGrammar/edgeBorder.ts` `buildLatticeProscenium` | PR #6 | PR #5's `extentsOf`; deep imports so the pure engine never loads the barrel's React component |
| Genesis source | `frameGrammar/latticeSource.ts`, `FrameSource 'lattice'` | PR #6 (rank-based vertex budget) | PR #5's `withMonogram`-style split |
| Reroll | `frame-studio/model/patternSeed.ts`, `useFrameStudio`, `FrameStudioControl` | PR #5's deterministic LCG; PR #6's UI | PR #5's `isLatticeActive` (the reroll also shows for an enabled composed layer) |
| Reeding fix | `edgeBorder.ts` | PR #2's per-axis tick length, generalised to `Math.hypot` (as PR #5) | PR #5's guard removal, now backed by a sweep |
| Brass finish | `render/frameMaterial.ts` | PR #6 (`FRAME_FINISHES`, per-finish cache key) | PR #5's "compile tone plumbing only for brass"; PR #2's `finishForFormula` |
| Rig / geometry | `ScreenBorderRig.ts`, `railGeometry.ts`, `decoCards.ts` | PR #6 | `decoCards` swap is new, tested |
| Export | `shared/lib/svgExport.ts`, `useLatticeExport` | PR #6 | corrections in §3 |

## 2. Defects found and fixed

| Defect | How it was found |
|---|---|
| `traceWalks` fenced itself in: the walker reserved a clearance halo as it entered each cell, so its own halo rejected its next step and medallions drew almost no strands | PR #6's 12 tests: 9 failed before the fix. Medallion goldens moved from 123 specs / 10 paths to 243 / 11 (level 3: 27/7 to 147/8) |
| Reeding recursion read every tick's y-extent, so the side runs never subdivided | A test written from PR #2's assertion failed; its first version passed despite the bug (corner-fan rays share the sub-tick `z`), so it now filters to reeding ticks. Three tests fail against the old code |
| `clampFrameStyle` dropped `formula.seed`, which would have silently pinned every reroll to the default pattern | Found while wiring the reroll, then covered by two tests |
| `buildNineSlice` let non-finite `hw`/`hh`/`level`/`density`/`cornerRatio` through `Math.max`/`Math.min` as `NaN` | PR #5's "never NaN" assertion, restated against PR #6's builder |
| PR #6's brass material declared `aTone` on the gold program too, so the delivered gold shader changed | A snapshot of the gold program, recorded **before** the change, failed against PR #6's version |
| A null `toBlob` made PNG export a silent no-op, and the QR button called it fire-and-forget | Reading `svgExport` in Phase 0. It now rejects; `useQrGenerator` catches into `exportError`, shown with `role="alert"` |

## 3. Corrections to what I took

- `svgExport`: the fallback stem is `download`, not `golden-qr`, and the error says "image", not "code". The QR module keeps `golden-qr` as its own default, so its behaviour is unchanged.
- A comment inherited from PR #6 said the serializer omits `xmlns` for an HTML-parsed SVG. A probe showed it does add it; only a namespace-less element comes out bare. The comment and a test were corrected.
- The reeding "dead guards" (`MIN_RAY_LENGTH`, two single-element fallbacks) were removed only after a sweep over every corner of the 10-gene box (1024 genomes, three aspect/weight extremes, over 100,000 rails) showed none can trip. The sweep bites: widening `rayReach` to 0.001 makes it name the offending genome.
- `railGeometry`'s zero-length early return was unreachable (the per-segment floor makes the length positive) and was removed.
- A threshold on `frameMaterial.ts` was added and removed: `render/**` is excluded from the coverage gate, so it would have measured nothing.

## 4. Golden cross-validation (T4.11)

The 10 lattice goldens (`composition.golden.test.ts`) against each PR's snapshot file:

| Source | Identical | Same spec/path counts |
|---|---|---|
| PR #6 | 10 of 10 | 10 |
| PR #2, PR #3 | 7 of 10 | 10 (hashes differ for the lucky-draw frame, invitation panel and premiere frame) |
| PR #5 | 6 of 10 | 6 |
| PR #4 | 3 of 10 | 10 |
| original `main` | 3 of 10 | 6 |

Reading the table: the **medallion** goldens agree with `main` at levels 1 and 2 and move at levels 3 and 4 only because the walk fix adds strands, which is the intended change. The **frame** goldens (lucky-draw, invitation panel, premiere frame) differ from PRs #2/#3 in hash but not in counts; the cause was not investigated (PR #6's `composition.ts` seeds the frame bracket, which is the likeliest source, but I did not check PRs #2/#3 against it). I took PR #6's, and did not judge which looks better. The **authored and poster** goldens (`frameGrammar/golden.test.ts`) are byte-identical to `main`, which is the check that matters most: nothing outside the lattice moved.

## 5. Practical impact / what a future reader must know

- **Never rendered.** The brass finish is checked as text (`onBeforeCompile` with stand-in chunks) and as material constants. The gold program is protected by a snapshot; the brass look is not. A person needs to look at it on a real GPU.
- A card or the screen border is brass if its formula has a lattice foundation or an enabled lattice layer, or its pattern is `lattice`; otherwise gold. The swap replaces and disposes the material.
- `frameMaterial` is not covered by the percentages (`render/**` is excluded, CLAUDE.md §2). `decoCards.ts`, also excluded, got its own jsdom test because it holds the finish swap; removing the swap fails 3 of its 6 tests.
- Rerolls are deterministic (`nextPatternSeed`), not random, so a sequence can be replayed and asserted.
- **No screen calls `useLatticeExport` yet.** It is exported and tested; PR #6 mounts it in the spectacle preview, which is Phase 5.
- Not taken: PR #5's `latticeAdapter`/`railTone` (a second path to the same conversion) and PR #2's `lattice-strand`/`octagram` rail kinds.
- Global coverage floors ratchet to 76 / 74 / 72 / 76 (measured 76.1 / 74.1 / 72.4 / 76.8). Named 100 percent thresholds were added for `walk`, `clip`, `nineSlice`, `motifs`, `tone`, `latticeSource`, `patternSeed` and `svgExport`.

## 6. Validation actually performed

`npx tsc --noEmit` clean; `npm test` 1096 tests pass; `npm run test:coverage` passes its gates; `npm run build` succeeds. **Not done:** any GPU rendering, any browser run of the Frame Studio controls, and any human look at the lattice, the brass or the reroll. Visual verification pending.
