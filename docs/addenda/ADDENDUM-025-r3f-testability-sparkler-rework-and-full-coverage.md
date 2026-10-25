# ADDENDUM-025 — R3F testability refactor implemented (ADDENDUM-022), orbs reworked as sparklers, premiere spectacle overlay, literal 100% coverage gate

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (implemented here in full), ADDENDUM-020 §3.9 (premiere preview overlay), ADDENDUM-021 (lattice walks), ADDENDUM-024 (spectacle port); CLAUDE.md §2 (explicitly overridden in part — see §4.1), §3, §6, §7, §9.
**Status:** Implemented — visual check pending (no browser or GPU in the build sandbox; see §7).

## 1. What was decided

Four user-directed changes land together:

1. **ADDENDUM-022 is implemented, Phases 0–3, in one change.** The plan gated later
   phases behind user baseline checkpoints (likeness screenshots reviewed by a person
   at a GPU). The user explicitly overrode that gating: full refactor now, likeness
   verification afterwards. The imperative `GatsbySceneManager` is deleted; the
   premiere renders through React Three Fiber behind a renderer-neutral API.
2. **"Orbs" are party sparklers, and are now drawn as such.** The orbs transition is
   reworked into sparkler wands — visible wire stick, advancing burn front, crackling
   spark spray — and renamed `sparkler-transition` canonically. `orb-transition`
   remains as a deprecated typed alias dispatching to the same implementation, so
   Event Night and any saved presets keep working. User-facing copy reads "Sparklers".
3. **The Gatsby Premiere gains the spectacle button + small overlay** of
   ADDENDUM-020 §3.9: a header launcher (`spectacle-preview__launch`) toggles the
   reusable non-modal `spectacle-preview` panel over the premiere stage (left-docked),
   with stage-click origin picking, keep-clear speaker/glyph helpers, and the lucky
   draw chained to confetti + name-reveal on landing.
4. **Coverage is gated at a literal 100%** — lines, statements, functions and
   branches — including React, Three.js and canvas rendering code, via mocks and
   headless renderers. This overrides CLAUDE.md §2's "rendering code … is not
   unit-tested" rule. The user directed this explicitly; this addendum is the
   deviation record (§4.1).

| Surface | Where | Notes |
|---|---|---|
| Freeze hook | `src/features/premiere/model/freeze.ts` | `?freezeAt=<seconds>` per ADDENDUM-022 §0.2; never throws |
| Pure choreography | `src/features/premiere/scene/{choreography,styleClamp,orbitFocus}.ts` | tests-first; feed both camera rigs |
| Scene API port | `src/features/premiere/scene/sceneApi.ts` | `PremiereSceneApi`, renderer-neutral |
| R3F implementation | `src/features/premiere/scene3d/` | Zustand vanilla `premiereStore`, `storeSceneApi` adapter, declarative scene, extracted shaders (`shaders/*.glsl.ts`) |
| Sparkler transition | `src/features/spectacle/effects/sparklers/` | `sparklerPlan`, `sparklerWand`, `sparkSpray`, `sparklersEffect`; orbs modules are deprecated shims |
| Premiere overlay | `src/app/GatsbyPremiere.tsx`, `src/app/hooks/usePremiereSpectacle.ts` | hook decides (panel state, origin picking, draw chaining); component renders |
| Reusable preview helpers | `src/features/spectacle-preview/components/{OriginCrosshair,PickOriginHint,KeepClearSpeaker}.tsx` | lifted out of `event-night`, which now consumes them through the barrel |
| Coverage gate | `vitest.config.ts` | V8 provider, thresholds 100/100/100/100; `vite.config.ts` untouched per CLAUDE §3 |
| E2E scaffold | `playwright.config.ts`, `e2e/` | likeness + flow specs over the freeze hook; **not yet run** (§7) |

## 2. Why

The premiere was the last large surface with no executable specification: a
several-hundred-line imperative scene manager whose camera, timing and style rules
could only be checked by looking at pixels. ADDENDUM-022 planned the way out; doing
it in full means the choreography is now pure functions with golden tests, the scene
is a typed component tree driven by a store, and any future renderer can implement
`PremiereSceneApi` and reuse every premiere hook unchanged.

The orbs were glowing balls because the reference implementation drew circles; the
user's intent was hand-held party sparklers. Renaming alone would have left the
visual lying about the copy, so the effect was reworked while reusing the spectacle
particle machinery (ballistics, glitter gating, blackbody colour) that already
existed for fireworks.

The coverage gate exists because the user asked for proof, not sampling: with the
recording-canvas harness (ADDENDUM-024), the R3F headless test renderer and jsdom,
every statement in the repo is now executed by at least one test, and the thresholds
make regressions fail the build instead of eroding quietly.

## 3. Relation to the base spec and earlier addenda

- Implements ADDENDUM-022 in full; its register row is updated to point here.
- Completes ADDENDUM-020 §3.9's preview overlay on the premiere surface (024 had
  delivered it only inside Event Night).
- Supersedes the *name and rendering* of 020/024's orb transition; the transition's
  timing contract (cover point, crossfade fallback, `onCovered`) is unchanged.
- Fixes two latent generator bugs found while chasing the last uncovered branches
  (§5). ADDENDUM-021's walk-based medallion layer now produces the strands the
  tutorial describes for the first time.

## 4. Deviations and decisions (which won, and why)

1. **CLAUDE §2 override (rendering is unit-tested).** §2 says rendering code "is
   kept thin and is not unit-tested". The user instructed literal 100% coverage
   including rendering. Rendering is therefore tested through seams: the recording
   2D context for canvas effects, `@react-three/test-renderer` for the scene graph,
   jsdom + Testing Library for DOM. The pure layer still carries correctness; the
   rendering tests assert structure, lifecycles and draw-call digests, not pixels
   (which §2's geometry-not-pixels snapshot rule still governs). CLAUDE.md itself is
   unchanged; this addendum records the deviation, per §1's addendum-first rule.
2. **ADDENDUM-022's checkpoint gating was waived by the user, not satisfied.** The
   likeness gate (frozen-frame screenshots compared before/after) could not run in
   the sandbox: no browser, no GPU, Chromium download blocked. The Playwright
   scaffold (frozen shots at 1.0/4.32/6.7/11.28/18.08/24.82/33.8/37.0 s, SwiftShader,
   `maxDiffPixelRatio 0.01`) is committed but **has no baselines and has never been
   executed**. First run on a real machine must be `npm run e2e:update` followed by a
   human review of every baseline; until then the R3F port is verified structurally,
   not visually. This is the honest state; nothing in the test suite should be read
   as a likeness pass.
3. **Sparkler snapshots changed; orb goldens were re-recorded.** The spectacle
   golden suites (`effects.golden`, `planning.golden`) differ because the effect now
   draws wands and spray instead of orbs and because the catalogue key set changed.
   No other effect's digest moved.
4. **Medallion goldens changed because walks now walk (§5.1).** Level-3 medallion
   spec counts 27 → 147, level-4/default 123 → 243 (paths 7 → 8 and 10 → 11).
   Frame-mode and level 1–2 digests are bit-identical, confirming the fix is
   confined to the walk layer.
5. **Dead defensive branches were removed rather than force-tested.** Reaching a
   literal 100% surfaced branches that are unreachable *by invariant*, not merely
   untested. Where the invariant is provable at the call site, the branch was
   deleted or converted to a documented type-level guarantee instead of writing a
   test against a state the program cannot be in. Examples: genome-clamped length
   guards in `edgeBorder` (clamped genes keep every ray/tick above the thresholds);
   the second NaN check in `parseFreezeAt` (subsumed by the finite check above it);
   `useFrame` null-ref guards in scene3d (the referenced nodes are always mounted
   when frames run); `formula.layers ?? …` fallbacks in `useFrameStudio` (replaced
   by a `StudioFormula` type whose layers are required, matching how the hook seeds
   and updates state); `Dialog` reading `event.currentTarget` instead of a ref it
   also owns. Each is behaviour-preserving under its stated invariant, and the
   invariant is written at the site.
6. **Premiere overlay picks origins on any stage click, including HUD children**
   (events bubble to the stage container), mirroring Event Night's composition. It
   is harmless there and kept consistent here; noted for the browser check.
7. **Bundle growth accepted.** The single-file build is 1,751.55 kB
   (gzip 572.31 kB), up from 1.34 MB in ADDENDUM-024 — the R3F/drei/zustand
   runtime. No code-splitting was introduced; the delivery format (one tracked
   `dist/index.html`) is unchanged.

## 5. Two latent generator bugs found by the coverage chase

### 5.1 `traceWalks` never advanced (`src/features/deco-lattice/model/walk.ts`)

`reserve()` marked the full 3×3 neighbourhood around the current point as occupied,
and every `OCTI_DIRS` step lands exactly one cell away — inside that neighbourhood.
`isFree(next)` therefore failed on the first step of every run, for every seed, and
`traceWalks` always returned `[]`. The medallion's tutorial layer 3 ("random
directions") silently emitted nothing; only the fixed diagonal arm and axis arrow
showed. The fix keeps the intended one-cell clearance between walks but tracks
*visited cells* and exempts the walking head and the cell it just came from when
testing the next step's neighbourhood. Walks now advance, turn (±45°/±90° weighted),
and stop on obstacles, the wedge and the annulus, as documented. Existing tests that
had encoded the empty result now assert real advancing geometry, including both
90° turn directions chosen by seed search over the same `mulberry32` the walker uses.

### 5.2 Edge-border reeding never subdivided vertical runs (`edgeBorder.ts`)

The fractal sub-tick pass measured a tick's length from its y-extent for both run
orientations. Vertical-run ticks are horizontal segments (y-extent 0), so their
sub-tick height computed as 0 and the "along y" branch was unreachable — left/right
border edges never got the half-height sub-ticks the top/bottom edges have. The
measurement is now axis-aware. No golden snapshot changed (the signature genome has
`fractalDepth 0`, so delivered borders are pixel-identical); the change is visible
only for user genomes with fractal depth ≥ 1 in the Frame Studio.

## 6. Standards alignment

New and refactored units keep the §6 limits (functions ≤ 50 lines, ≤ 3 parameters,
no boolean flags, `{component}__{role}` test ids, barrel imports, features never
import `src/app/`). The premiere overlay follows "components render, hooks decide":
`usePremiereSpectacle` owns panel state, origin picking and the lucky-draw →
confetti/name-reveal chain; `GatsbyPremiere` only composes. The scene3d frame loops
read the store transiently (`getState()`), so playback never re-renders React;
`PlaybackClock` (priority −1) marks the frame ready at frame 3 for the freeze hook,
and `CinemaComposer` renders manually at priority 1.

**Known debt (unchanged):** `PremiereHeader.tsx`, `PremiereTimeline.tsx` and
`FrameStudioDock.tsx` still exceed the 50-line guidance, as recorded in
ADDENDUM-001/024; this change only added props/tests around them.

## 7. Validation actually performed

- `npx tsc --noEmit` — clean.
- `npm test` — 161 files, **854 tests, all passing** (non-update run; the only
  snapshot updates ever written were the §4.3/§4.4 goldens, reviewed as diffs).
- `npm run test:coverage` — **100% lines (5625/5625), 100% statements (6356/6356),
  100% functions (1460/1460), 100% branches (2325/2325)**; thresholds in
  `vitest.config.ts` enforce it. Trajectory from the pre-gate baseline:
  66.93% → 85.77% → 97.31% → 99.78% → 100% lines.
- `npm run build` — single-file bundle 1,751.55 kB │ gzip 572.31 kB.
- **Not performed:** Playwright e2e/likeness (no browser in the sandbox; Chromium
  download blocked), and any visual/GPU check of the R3F premiere or the sparkler
  effect. Three.js prints deprecation warnings (`THREE.Clock`, CJS require) under
  the headless renderer; both are upstream noise, not failures.

**Validation line:** tsc ✓ · vitest ✓ (854 tests, 100% coverage gate) · build ✓ · browser/Playwright ✗ — no browser/GPU available in sandbox; visual check pending.

## 8. Follow-ups for the first run on a real machine

1. `npx playwright install chromium`, then `npm run e2e:update`; review every
   baseline image before committing it — they become the ADDENDUM-022 likeness gate.
2. Eyeball the premiere overlay: panel docking at `bottom-24 top-16`, width
   `min(320px, 92vw)`, origin picking over the 3D stage, and HUD click bubbling (§4.6).
3. Eyeball sparklers in the preview panel and Event Night: wire visibility, burn
   front travel, crackle density, inward collision flash at 62% of travel.
4. Confirm medallion layers 3–4 now show walk strand bundles and that density still
   reads as the tutorial intends (§5.1 increases level-4 spec count ~2×).
