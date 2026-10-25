# ADDENDUM-028 — Premiere pure seams: choreography, orbit focus, clamps, clock, scene port

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §3, §5, §7; CLAUDE.md §2, §5, §6, §7. Implements ADDENDUM-022 Phase 1 as integrated by ADDENDUM-027.
**Status:** Implemented. `GatsbySceneManager` now delegates to these modules; it is deleted in Phase 3 after a measured parity check.

## 1. What was decided / done

The per-frame maths in `GatsbySceneManager.animate()` and its setters moved into pure, `three`-free
modules under `src/features/premiere/`, each taken from the best of the five parallel PRs and corrected
where `main`'s shipped behaviour was the reference.

| Module | Holds | Base | Taken from the others |
|---|---|---|---|
| `model/freeze.ts` | `?freezeAt=` parser | PR #4 shape | PR #2 strict-decimal regex |
| `scene/choreography.ts` | `smoothstep/clamp/lerp`, `activeChapterIndex`, `chapterProgress`, `cardPhase` + `cardRole`, `cinemaCameraZ`, `nitrateLevel`, `greenLight`, `searchlightSway`, `lightRig`, `rigAnchors` | PR #3 | PR #5 `CardRole`; PR #6 named constants; PR #2 `chapterProgress` and nitrate `mode` |
| `scene/orbitFocus.ts` | orbit window, hold time, camera offset, one-shot plan | PR #6 | PR #2 boundary epsilon |
| `scene/styleClamp.ts` | every input clamp | PR #6 | PR #5 `chapterJumpTarget`; PR #3 alias-safety tests |
| `scene/sceneApi.ts` | `PremiereSceneApi`, `FrameStudioScenePort`, `PlaybackTelemetry`, `SceneCallbacks` | PR #6 | — |
| `scene/playback.ts` | `advanceClock`, `advanceElapsed`, `isFrameReady` | PR #6 | — |

`animate()` is now three short methods (`stageCards`, `driveCinemaCamera`, `stageAtmosphere`) around a small loop;
`GatsbySceneManager.ts` falls from 649 to 575 lines.

## 2. Why these choices (and where I departed from the PR I based on)

- **No boolean flag parameters** (CLAUDE.md §6). PRs #3, #4 and #6 passed `isFinale`; PR #5's `role: 'standard' | 'finale'`
  is used. The nitrate toggle likewise takes `'auto' | 'forced'`.
- **`lerp` is three's `(1 - t) * x + t * y`**, not PR #6's `a + (b - a) * t`. Over 200,000 random inputs the two differed
  in 47,574 (24 percent), by at most 7e-15, and the camera Z is lerped every frame, so the shipped form is kept and pinned
  bit-identical by a test.
- **The nitrate gain (0.82) is its own constant**, applied in `nitrateLevel`, not baked into `openingNitrate` as PR #6
  did, which would change `openingNitrate`'s contract for any consumer wanting the raw fade.
- **The film wraps to exactly 0**, as the manager did. PR #6 carried the remainder over (it asserts a wrap from 37.99 with
  a 0.05 step lands on 0.04), which would change the loop's first frame that the likeness gate pins.
- **The shader clock is uncapped, the film clock is capped at 50 ms**, as the manager had them (`clock.elapsedTime` vs
  `Math.min(0.05, getDelta())`). A test pins the difference against both the original and the refactored manager.

## 3. Defects found and fixed (each has a test that fails without the fix)

| Defect | Where | Fix |
|---|---|---|
| `?freezeAt=-0` returned `-0` (passes both the regex and the range check); shared by all five PRs | `freeze.ts` | normalised to `+0` |
| Orbiting from a time exactly on 0.85 of chapters two to four computed 0.8500000000000001, read as "outside the hold", jumped the clock and paused a guest who was inside it | `orbitFocus.ts` | `1e-9` edge epsilon (PR #2's idea; two tests fail when it is removed) |
| `THREE.MathUtils.clamp` passes NaN through: a NaN seek read as "the finale" and teleported there; a NaN chapter index indexed an undefined chapter and threw | `styleClamp.ts` | NaN falls back to the start, chapter 0, baseline intricacy, level 1, default border weight |
| `Math.min(0.05, NaN)` is NaN: one bad frame delta would have turned the playhead into NaN permanently | `playback.ts` | a NaN or negative delta is a frame that did not happen |

None is reachable from the UI today, which is why no recorded frame moved. They matter once a second renderer, a scrubber
or a URL parameter can feed these inputs.

## 4. Practical impact / what a future reader must know

- **Every expected value in the new tests was computed from the shipped manager's inline arithmetic** (evaluated with
  `THREE.MathUtils`), not from the new modules. One probe used guessed chapter times and was discarded when I checked
  the real `sequence.ts`; the values in the tests come from the real data. A typo in one hand-typed oracle digit was caught
  by its test; all six hand-typed oracle values were then re-checked against the probe output.
- **`GatsbySceneManager.test.ts` is a characterisation suite** (adapted from PR #6, the only PR that tested the manager).
  Twelve frame-trace snapshots were recorded against the *unmodified* manager before it was touched; after the refactor
  the snapshot diff is zero lines. The renderer, composer, controls, card builders and textures are doubled at their
  module seams; everything the class decides itself runs for real. It is deleted with the manager in Phase 3.
- `choreography.test.ts` also holds a 153-frame sampled golden (every 0.25 s over the whole sequence). It was
  cross-checked against the manager's own inline arithmetic: 153 of 153 frames identical. The other PRs' snapshots use
  different sampling and column sets and were not diffed line by line; their *assertions* were merged by hand (§5).
- **`sceneApi.ts` is checked at compile time** (`expectTypeOf`); `tsc --noEmit` is what fails. Verified to bite: changing
  `dispose()`'s return type breaks `tsc`, and narrowing the port breaks it.
- **`clampScreenBorderStyle` spreads its input**, so fields it does not own (the lattice `pattern` and `seed`, which PR #6
  found were silently dropped) pass through. The type does not carry them yet; a structural test pins the guarantee until
  the lattice work lands.
- Pointer smoothing, resize and teardown stay in the manager until the R3F port replaces it.
- `playback.ts` lives in `scene/` beside the manager, not in `scene3d/` as the PRs placed it, because `scene3d/` does not
  exist yet; the R3F components import it from here.

## 5. Test merge record (this phase)

Tests in the files that now exist: `freeze` 41, `choreography` 97, `orbitFocus` 15, `styleClamp` 23, `playback` 17,
`sceneApi` 7 (compile-time), plus the manager characterisation suite (31 tests, 12 snapshots).

| Subject | Unique assertions lifted | Dropped as duplicate |
|---|---|---|
| `freeze` | 9 inputs no PR tested, plus the `-0` fix; one parameterised file from five suites | inputs asserted in more than one of the five suites |
| `choreography` | chapter progress (PR #2); smoothstep symmetry (PR #6) and multi-window parity (PRs #2, #5); lerp extrapolation; boundary hand-over from both sides; frame-before-text, corridor fade and gate-open ordering; finale-never-parts sweep; shared fade curve (PR #6); camera monotonicity, finale approach, 85 percent pull-back share; sway and rig bounds; green light visibility threshold | primitives, staging window, named constants and anchor values asserted in all five suites |
| `orbitFocus` | window, hold, offset, plan, `span > 0` guard (PR #6); epsilon (PR #2) | repeated plan cases |
| `styleClamp` | alias safety, layer copy (PR #3); jump target (PR #5); input immutability (PRs #2, #5) | repeated pass-through cases |
| `playback` | long-frame cap, frozen elapsed (PR #6), wrap-to-zero | — |

These are Class 2 subjects (the API differs by winner), so each lifted assertion was *ported*, not copied: inputs kept,
expected values recomputed from the shipped manager. Two things the other PRs asserted that I did **not** take, because
they disagree with the shipped manager: PR #6's remainder-carrying wrap and PR #6's `openingNitrate(0) === 0.82`.
The per-assertion counts the plan's Phase T calls for are not tallied here; they are produced once, at the end (ADDENDUM-036).

## 6. Validation actually performed

- `npx tsc --noEmit`, `npm test` (675 tests, 70 files), `npm run build` pass after every task; the coverage gate passes.
- The manager's 12 recorded frame traces are unchanged after the refactor (snapshot diff: 0 lines).
- New modules are held at 100 percent by named thresholds: `freeze`, `choreography`, `orbitFocus`, `styleClamp`, `playback`.
  Global coverage rose from 65.3 to 66.3 statements and 64.3 to 65.8 branches; the floors were raised to match.
- Not performed: any browser run. The change is pure refactoring behind a recorded trace; browser parity against a build of
  `main` is Phase 3.
