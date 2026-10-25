# ADDENDUM-025 — Coverage to 100%: the DOM harness, the Deco Lattice walk fix, and the honest exceptions

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2 (tests first, kept real), §3 (test infrastructure), §7 (validate early and honestly); ADDENDUM-001 (known debt), ADDENDUM-022 §5 (r3f testability).
**Status:** Implemented — coverage gate is green; visual verification unchanged (still pending, no browser here).

## 1. What was decided

`src/` is now covered to **100% statements / 100% branches / 100% functions / 100% lines**, and
`vitest.config.ts` enforces that as a gate (thresholds at 100 for all four metrics).

| Metric | Start of this work | Now |
|---|---|---|
| Statements | 49.94% | **100%** (6002/6002) |
| Branches | — | **100%** (2134/2134) |
| Functions | — | **100%** (1306/1306) |
| Lines | — | **100%** (5349/5349) |
| Test files / tests | 59 files, 414 tests | **137 files, 1109 tests** |

Three things made that possible and are the substance of this addendum:

1. **A DOM test harness** (jsdom + React Testing Library + a canvas 2D stub) that runs *beside* the
   node suites rather than replacing them, because most of the uncovered code was rendering and
   canvas work that CLAUDE.md §2 had previously excluded from unit tests.
2. **Real bug fixes** found by writing those tests — the most important being a Deco Lattice walk
   bug that made the generated medallion miss every walk, and a render-loop handle that was never
   cleared on dispose.
3. **A short, explicit list of code that no input can reach**, marked with coverage-ignore blocks
   and each one justified in place. Everything else is exercised.

CLAUDE.md §2 said rendering code "is not unit-tested". This addendum overrides that line for this
repository: rendering code *is* tested now, at the level of "does it compute the right DOM/geometry
and call the right context methods", with pixel equivalence deliberately left out.

## 2. Why

The base spec's validation loop (`npx tsc --noEmit`, `npm test`, `npm run build`) only proves the
pure layer. With the port of the spectacle suite, the Event Night screen, the Deco Lattice frame,
the QR generator and the gilded portrait/avatar studios (ADDENDUM-018…024), the *uncovered* half
became the half that ships the visuals — effects scheduling, canvas painting, SVG chrome, the frame
studio's control surface. A regression there is a blank screen, not a failing unit test. A 100%
gate makes those surfaces as load-bearing as the geometry math, and it makes the next port cheaper:
the harness primitives (fixtures, canvas stub, rAF pumping, reduced-motion stub) already exist.

## 3. Relation to the base spec and earlier addenda

- Touches BUILD_PROMPT §3 (visual system) and §7 (interface surfaces) only by *testing* them; no
  visual behaviour was intended to change. Where it did change, §4 lists it.
- Supersedes the CLAUDE.md §2 sentence about rendering code; supersedes CLAUDE.md §3's
  "`npm test` runs `vitest run` with `vitest.config.ts` (node environment)" only by adding a
  per-file jsdom opt-in and a `setupFiles` entry — `vite.config.ts` stays untouched, as required.
- ADDENDUM-022 §5 planned the scene/React seam that made the premiere hooks testable; this
  addendum uses it.

## 4. Bugs and behaviour changes found by covering the code

### 4.1 Deco Lattice walks never happened (real bug, fixed)

`src/features/deco-lattice/model/walk.ts` reserved a walk's own one-cell margin in the shared
`occupied` set *before* taking its first step. Since the margin covers the eight neighbouring cells,
every candidate next cell was already marked taken, so `traceWalks` returned `[]` for **every**
option set — the medallion's level-3 layer silently contained a diagonal arm, an axis arrow and no
walk bundles at all.

Fix: each walk keeps its points in its own `own` set; `reserve()` runs once, over `own`, after the
walk finishes. Consequence for the golden snapshots (`composition.golden.test.ts.snap`, geometry
data only, per CLAUDE.md §2):

| Golden case | Before | After |
|---|---|---|
| default medallion | `hash 1fd4633…`, paths 10, specs 123 | `hash e6d42a1…`, paths 11, specs 243 |
| medallion level 3 | `hash b00eaa8…`, paths 7, specs 27 | `hash 581753a…`, paths 8, specs 147 |
| medallion level 4 | same as default | same as default (level 4 is a superset) |
| spooner-medallion preset | same as default | same as default |

The earlier working note that "the delivered medallion annulus (inner 0.58·m, outer 0.9·m, cell
0.015·m) can never start a walk because the start point sits on the `y = cell` guide" was a
**misdiagnosis of this bug**, not a property of the geometry: the start point sits at radius
≥ 0.61·m, comfortably inside the annulus. `walk.test.ts` therefore keeps its unit-cell annulus for
the turn/overlap assertions *and* adds a case on the real medallion annulus, which now yields
walks (5 at the delivered density 0.7, 2 at density 0). A walk's vertex-to-vertex leg is a whole
run of cells, not one cell — the tests assert whole-cell / whole-√2 legs rather than single steps.

### 4.2 `GatsbySceneManager.dispose()` left the render handle set

`dispose()` cancelled `this.rafId` but never cleared it, so a second `dispose()` cancelled a stale
handle and the `rafId !== null` guard was decorative. It now sets `this.rafId = null`. The existing
test asserted the old value (`rafId` not null after dispose) and was corrected.

### 4.3 Smaller corrections

- `premiere/audio/cinemaAudio.ts`: `triggerActShimmer`'s guard was split into the reachable
  `isEnabled` early-out and a defensive context/gain check, so the former stays measured.
- `art-deco-frame/engine/frameGrammar/generative.ts`: non-finite genome values are clamped instead
  of propagating `NaN` into geometry.
- `gilded-portrait/pipeline.ts`: the tone LUT is built from the curve's own samples; tests assert
  variant-ness (three specular peaks for the trophy preset), never exact pixel values.

## 5. The harness

`vitest.config.ts` keeps `environment: 'node'` as the default (pure modules stay fast) and adds:

- `setupFiles: ['./src/test/setupDom.ts']` — guarded by `typeof document !== 'undefined'`, so it
  is a no-op in node suites. In DOM suites it installs `vitest-canvas-mock`, no-op
  `ResizeObserver`/`IntersectionObserver`/`scrollTo`, pointer-capture no-ops and a `matchMedia`
  stub that reports no reduced-motion preference.
- `include: ['src/**/*.test.{ts,tsx}']` — DOM suites are `.tsx` files whose first line is
  `// @vitest-environment jsdom`.
- Coverage: `provider: 'v8'`, `include: ['src/**/*.{ts,tsx}']`, excluding tests, `src/test/**` and
  type-only files. Thresholds at 100 for all four metrics.

Dev dependencies added (`package.json`): `@vitest/coverage-v8`, `jsdom`,
`@testing-library/{react,dom,user-event}`, `vitest-canvas-mock`. `node_modules/` and `coverage/`
are now git-ignored, and the previously tracked `node_modules/` tree was removed from the index.

Conventions the suites follow: RTL `render`/`screen`/`renderHook`; `userEvent` for interaction and
`fireEvent` for range/file/pointer/change; `vi.hoisted` + `importOriginal` for partial mocks; rAF
pumped inside `act()`; fixtures built from domain-realistic data (named acts, real archetypes),
never `item-1`.

## 6. The exceptions (coverage-ignore blocks, and why each is honest)

Nineteen `/* v8 ignore start */ … /* v8 ignore stop */` blocks remain, all on guards that no input
can reach because the caller clamps first:

| File | Ignored guard | Why it cannot fire |
|---|---|---|
| `art-deco-frame/engine/frameGrammar/edgeBorder.ts` (8 blocks) | seam snap to exactly 0; `partDir ?? 1`; `ribs === 1`; sub-ray under `MIN_RAY_LENGTH`; `count === 1`; tooth under `MIN_TICK_LENGTH`; the `y` branch of a horizontal run's tick subdivide | `density ∈ [0,1]` plus `Math.max` clamps give `ribs ≥ 3`, `count ≥ 3`, reach ≥ 0.315 and tooth ≥ 0.03; `rail()` always writes `partDir`; horizontal runs are culled by their zero y-height before the tick ternary |
| `art-deco-frame/engine/frameGrammar/grammar.ts` | `miterAt` with both neighbours null | `offsetPolylineOutward` returns early below two points |
| `art-deco-frame/render/railGeometry.ts` | zero-length polyline guard | every segment contributes at least `1e-4` |
| `spectacle/particles/blackbody.ts` | `x` above the last ramp stop | `x` is clamped to 1, the last stop's own `t` |
| `enamel-backdrop/palettes.ts` | empty `accents` fallback | every jewel palette ships four tones |
| `frame-studio/hooks/useFrameStudio.ts` (4 blocks) | `formula.layers ?? DEFAULT_FRAME_LAYERS`; `layer?.enabled ?? false`; `layer?.level ?? 2` | hook state always carries a full layer list |
| `premiere/audio/cinemaAudio.ts` (3 blocks) | context/gain null checks in `triggerActShimmer`; empty drone bank | `dispose()` nulls the context and no caller holds a disposed engine; the bank has four oscillators whenever `isEnabled` |

Two toolchain notes worth keeping:

- **`/* v8 ignore next */` is silently ignored here.** Vite's esbuild transform strips non-legal
  comments before the coverage provider sees the code, so node-attached hints never match. Only the
  `start`/`stop` block form (matched by offset range) works. Verified with a two-line probe file.
- A `vi.restoreAllMocks()` on a `getContext` spy kills `vitest-canvas-mock` for the rest of the
  file; per-test `spyOn(...).mockRestore()` inside `try/finally` is safe.

## 7. Practical impact / what a future reader must know

- `npm test` is the coverage gate: the script is now `vitest run --coverage`, and it fails below
  100% on any metric. `npm run test:watch` runs the plain watcher without coverage.
- Adding a feature means adding its DOM/effect tests in the same change, or adding a justified
  ignore block to §6's list — the second should be rare, and the comment must say *why*.
- Do not stub `Path2D` globally, do not assert extruded-text height, and do not assert exact tone
  LUT values; the suites were written around those three jsdom/canvas limits deliberately.
- The goldens in `composition.golden.test.ts.snap` changed in this change and the reason is §4.1.

## 8. Validation performed

- `npm test` (`vitest run --coverage`) → 137 files, 1109 tests, all passing; statements 6002/6002,
  branches 2134/2134, functions 1306/1306, lines 5349/5349 (100% on all four, thresholds green).
- `npx tsc --noEmit` → clean.
- `npm run build` → 2207 modules transformed, `dist/index.html` 1,337.11 kB (gzip 447.23 kB).
- `vite.config.ts` untouched; `npm test` gained `--coverage` (and `test:watch` keeps the plain
  watcher). Test fixtures under `src/**/testing/**` are counted too, so they are exercised rather
  than excluded.
- **No browser in this sandbox**: type-checks, tests and build pass; visual verification of the
  Deco Lattice walk change is pending.
