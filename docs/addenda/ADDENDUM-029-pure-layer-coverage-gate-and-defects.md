# ADDENDUM-029 — The 100 % pure-layer coverage gate, and three defects it flushed out

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-021 (Deco Lattice), ADDENDUM-026 (frame-engine
integration), ADDENDUM-027/028 (testability); CLAUDE.md §2, §3, §5. **Status:** Implemented.

## 1. What was decided

`npm run test:coverage` now enforces **100 % lines, branches, functions and statements** over
the pure/testable layer, and fails the run if any metric drops. Scope (documented inline in
`vitest.config.ts`): every `src/**/*.ts` module, excluding `.tsx` components and a short list of
host/wrapper files that exist only to touch Three.js, the DOM or a CDN. Those exclusions are the
same files ADDENDUM-027/028 cover through the Playwright likeness gate and jsdom component
tests — the gate measures the layer the unit tests can honestly reach, and says so.

Closing the last gaps took ~90 new tests (598 → 651) plus two small testability extractions
that keep their old homes as compat re-exports:

| Piece | Where |
|---|---|
| Gate config | `vitest.config.ts` — v8 coverage, documented exclusions, 100 % thresholds |
| Pattern-seed extraction | `features/frame-studio/model/patternSeed.ts` (+ test) |
| File-stem extraction | `features/qr-generator/fileStem.ts` (+ test) |
| Dead code removed | redundant final interval checks in `clip.ts` (`clipEdge` already maintains `enter ≤ exit`), unreachable arms in `blackbody.ts`, `palettes.ts`, `edgeBorder.ts`, `grammar.ts` |

## 2. Three live defects the coverage hunt found

Each was invisible precisely because no test had ever executed the path:

1. **Frame-mode Deco Lattice ignored `seed`** (`deco-lattice/model/composition.ts`). The Frame
   Studio reroll changed nothing on screen. Fixed with a seeded corner bracket at frame layer 2
   (`seededBracket`), defaulting to the signature seed 1925. A regression test pins that two
   seeds produce different specs while the layer-0 frame rails stay byte-identical.
2. **`subdivide` measured only the y-extent** (`art-deco-frame/.../edgeBorder.ts`). Fractal
   sub-ticks never appeared on the vertical side runs of a frame. Fixed to use the true segment
   length (`Math.hypot`). Invisible in default renders because the signature genome keeps the
   fractal off.
3. **`traceWalks` could never take a step** (`deco-lattice/model/walk.ts`). `reserve()` fenced
   the full 3×3 neighbourhood around the walk's current cell — including all eight legal next
   cells — so every walk returned `[]`, the medallion's seeded walks silently never drew, and
   the existing annulus assertions passed vacuously over zero walks. Fixed: while walking, only
   the exact trail cells are occupied (self-avoidance); the 3×3 fence is applied around the
   finished trail for inter-walk spacing. The medallion golden snapshots legitimately grew, and
   a regression test now asserts at least one real walk with ≥ 2 points — plus a 64-seed sweep
   so every turn weight (including the ±90° arm seed 1925 never chose in 60 tries) is exercised.

## 3. Relation to the base spec

BUILD_PROMPT §7/§9 quality gates. No production behaviour changed beyond the three fixes
above; golden updates were limited to the medallion geometry the walk fix correctly restored.

## 4. Practical impact / future reader

- A new pure module without exhaustive tests **fails the gate**. Write the tests; do not lower
  the thresholds or widen the exclusions without recording why here.
- If a branch looks "uncoverable", treat that as a smell: two of the three defects above lived
  in exactly such branches. Prefer deleting genuinely dead code over ignoring it.
- Warm-up tests for the CDN loaders (`locateFace`, `segmentSubject`) flush 25 ms, not one tick —
  a cold dynamic import can outlast a single macrotask and flake.
- Coverage is a floor, not a proof: the walk annulus assertions were *green for months* over an
  empty result. Assert non-vacuity whenever a test loops over generated output.

## 5. Validation actually performed

- `npm run test:coverage` — 93 files, **651 tests passed**, All files **100 / 100 / 100 / 100**.
- Full gate: `npx tsc --noEmit` ✓, `npm test` ✓, `npm run build` ✓.

**Caveat:** 100 % coverage of the pure layer proves the code executes and matches its pins; it
does not prove pixels. Visual verification still runs through the Playwright likeness gate
(ADDENDUM-027 §5), whose screenshot baselines remain a user step:
`npx playwright install chromium && npm run e2e:update`.
