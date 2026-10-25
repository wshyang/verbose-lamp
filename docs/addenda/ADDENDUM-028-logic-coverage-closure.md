# ADDENDUM-028 — Logic-coverage closure: the last branches, the two ignores, and the limits that stay

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §7, §11; BUILD_PROMPT §3, §7;
ADDENDUM-022 §1, §3; ADDENDUM-025 §3.4; ADDENDUM-027 §4.
**Status:** Implemented — thresholds enforced; visual check of the geometry still pending.
**Audience:** the next agent who adds a branch, and any reader asking "is 100 % real, or
did the config hide something?".

## 1. The shape of the closure

Starting point of this wave: 100 % statements and lines, **95.28 % branches
(1514/1589)** and 99.79 % functions (995/997), spread over 36 files.

End state, verified with `npx vitest run --coverage` and pinned by
`coverage.thresholds` in `vitest.config.ts`:

| Metric | Covered / total |
|---|---|
| Statements | 4552 / 4552 — **100 %** |
| Branches | 1573 / 1573 — **100 %** |
| Functions | 999 / 999 — **100 %** |
| Lines | 3980 / 3980 — **100 %** |

113 test files, 1087 tests, all green. Thresholds are `100` on all four metrics, so a
single uncovered branch fails `npm run test:coverage` rather than politely reporting
a number.

## 2. How the branches were closed

In order of preference, and in these proportions:

1. **A test that reaches the state through the public door** (the vast majority).
   Defaults that a caller can actually omit; the reduced-motion path; an empty
   keep-clear sky; a stale async answer; a grid with no subject; the seam of a
   mirrored coordinate; a `?renderer=classic` mount without `freezeAt`.
2. **A pure helper extracted so the default is testable** — `layerSettingsOf` /
   `layerViewOf` in `frame-studio/model/layerView.ts`, `accentsOf` in
   `enamel-backdrop/accents.ts`. The hook keeps its `?? default`, but the default now
   lives in a three-line function with its own test instead of inside a `useMemo`
   that no input can reach.
3. **Dead code deleted** — provably unreachable statements, with the invariant named
   in a comment:
   - `framing.ts`: the `Number.isFinite(eyes)` re-check. `apart` is derived from the
     same four numbers, so a finite `apart` above the threshold already proves it.
   - `grammar.ts`: the "both neighbours missing" branch of `miterAt`. Endpoints are
     now handled at the call site with a one-sided normal, so `miterAt` only ever
     sees interior vertices and takes three non-null points.
   - `blackbody.ts`: the "past the last stop" colour. The ramp is clamped to [0, 1]
     and its last stop sits at 1, so a segment is always found.
   - `edgeBorder.ts`: the zero-length ray/tick guards (`buildEdgeBorder` clamps its
     genome at the entry), the `ribs === 1` / `count === 1` ternaries (both clamps
     floor at 3), and the `along === 'y'` half of the fractal subdivision. That last
     one is worth naming: a horizontal reed run has **zero vertical height**, so
     `subdivide(horizontal, 'y', …)` could only ever return `[]`. The call was dead,
     not merely uncovered; deleting it changes no geometry (verified by the existing
     golden frames).
   - `cinemaAudio.ts`: the null re-check inside the chord `forEach`. The values are
     hoisted to locals after the guard, which is also the honest way to write a
     closure that outlives `this`.
   - `effectScheduler.ts`: `let resolve = () => {}` became `let resolve!: () => void`;
     the promise executor runs synchronously, so the placeholder could never be
     called.
4. **Two `v8 ignore` blocks, both network imports** — `locateFace.loadTasksVision`
   and `segmentSubject.loadTransformers`. The suite injects its own loader
   everywhere; the default implementation is a bare `import()` of a jsDelivr URL,
   which this sandbox cannot reach and which no test may depend on. The block is
   `/* v8 ignore start */ … /* v8 ignore stop */` (the `next` form is **not honoured**
   by this Vitest/V8 pair — it silently does nothing, which is how an ignored line
   can look covered while still counting).

## 3. Test environments and why some suites are split

- Default environment is `node` (`ADDENDUM-022 §1.1`); DOM suites opt in with
  `// @vitest-environment jsdom`.
- `spectacle/model/qualityNode.test.ts` exists so `detectQualityEnv` is exercised
  **without a `window`** — the same file under jsdom can never see that state.
- `src/test/canvasStub.ts` installs a recording 2D context, because jsdom without
  `node-canvas` returns `null` from `getContext('2d')` and every painter module would
  be untestable. It records calls; it does not pretend to render. Pixels are still
  never asserted — goldens live on geometry and draw-call digests (`CLAUDE.md §2`).
- `src/test/digest.ts` quantises numbers to 1e-6 before hashing, so a golden that
  only passes on one machine cannot exist (`ADDENDUM-025 §2`).

## 4. What a new branch costs now

Adding a `?? default`, an early return or a ternary means adding the state that
exercises it, or expressing the default in an extracted pure function, or deleting
the branch. `npm run test:coverage` fails otherwise. That is the point.

## 5. Known limits, kept on purpose

- **`frameGrammar/edgeBorder` overshoots dense genomes on narrow viewports.** The
  composite clips it; the test asserts a bounded overshoot rather than containment
  for the gene extremes (`Jazz Fan` 3.01×, `Variation 5` 4.53× on a 0.5 aspect). Do
  not "fix" this by widening the bound silently — it is a visual decision.
- **`deco-lattice/model/walk.ts` halo bug (fixed).** The clearance halo used to be
  written into the same set consulted for *step* collisions, so every walk blocked
  its own neighbours and stranded at length one. `taken` (owned cells) and `spaced`
  (the 3×3 halo) are now separate sets; the geometry goldens were regenerated once,
  deliberately, and the fix is covered by `walk.test.ts` (determinism across seeds,
  wedge annulus containment, straight runs and turns both reachable).
- **`decoAlphabet` skeletons legitimately overshoot their box** — 5 % `OVERSHOOT`
  tolerance, not a bug.
- **`GatsbySceneManager.ts` is still present.** Deleting it is gated on the user's
  screenshot baselines (`ADDENDUM-026 §5`), and it is excluded from coverage by path
  *with that reason* rather than by omission.

## 6. Still open

1. `@react-three/test-renderer` suites for `scene3d/` (ADDENDUM-022 Phase 3) — the
   package is not in the lockfile; installing it here would be a registry round-trip
   for a renderer that cannot be seen.
2. Playwright (`e2e/flows.spec.ts`, `e2e/likeness.spec.ts`, both written and never
   run) — no browser in this sandbox.
3. The visual check of the Deco Lattice frames against the film stills (specs 123 →
   243), and of the R3F sequence against the classic renderer.
4. Deleting `GatsbySceneManager.ts` once that comparison passes (ADDENDUM-022 §2.5).
5. Phase 1's `FrameStudioControl.test.tsx` exists as `FrameStudioDock.test.tsx`; the
   assertions the plan listed are all there, the file name is not (ADDENDUM-026 §5).

**No browser in this sandbox; visual verification pending.** Every number in this
record is honest as a *test* number, and says nothing about how the result looks.
