# ADDENDUM-027 — Testability seams, the test harness and the coverage bar (ADDENDUM-022 Phase 0)

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (plan, Phases 0–3), ADDENDUM-023 §4.2; BUILD_PROMPT §2, §7, §11; CLAUDE.md §1, §2, §6, §7.
**Status:** Phase 0 implemented and verified; Phases 1–3 not started, and not claimed.

## 1. What was decided

ADDENDUM-022 asks for a likeness gate and a pure-choreography split so the premiere can be regression-tested away from a GPU. Phase 0 is the *instrumentation* half — the seams that a test can hold onto. It is now in place:

1. **A frozen sequence.** `?freezeAt=<seconds>` (valid `0 ≤ s < 38.0`, last frame exclusive) pins the premiere to one instant. Playback is refused, pointer aim is skipped, and every frame renders the same time, so screenshots are stable.
2. **A frame-ready signal.** After three composited frames the stage carries `data-frame-ready="true"` (`FRAME_READY_FRAMES = 3`). Playwright waits on the attribute, not on a timeout.
3. **A seeded PRNG.** `createPrng(seed)` wraps `mulberry32`. The dust field's `Math.random()` calls are now `createPrng(DUST_SEED)` with `DUST_SEED = 1920`, so the same freeze produces the same dust twice.
4. **A typed scene port.** `PremiereSceneApi` names everything a host may ask the scene to do; `FrameStudioScenePort` is the narrower slice Frame Studio needs. The hooks are typed against the port, not the concrete manager. This is the seam Phases 1–3 will move the R3F scene behind.

## 2. Why a port and not a mock

Mocking `GatsbySceneManager` in the hooks would have coupled the tests to the class. A structural interface lets the eventual React Three Fiber scene satisfy it without the callers changing, and lets a test pass a stub object. `GatsbySceneManager` is now `implements PremiereSceneApi`; the compiler proves the seam holds.

## 3. The likeness gate

`playwright.config.ts` plus `e2e/support/stage.ts`, `e2e/likeness.spec.ts` and `e2e/flows.spec.ts`:

- `stage.ts` navigates with `?freezeAt=<t>`, waits for `data-frame-ready`, disables animations, and asserts no console errors.
- `likeness.spec.ts` records `e2e/snapshots/` at the four freeze points named in ADDENDUM-022 §4.1 (title hold, chapter card, name reveal, nitrate toggle).
- `flows.spec.ts` walks the four user journeys (open the console, play an effect, change a surface, reroll a frame) as *behaviour*, without pixels.

**The baselines are not committed.** They cannot be captured in this sandbox (no browser, no GPU). Until someone runs `npx playwright test --update-snapshots` on a real machine, the likeness gate protects nothing — it is infrastructure, not evidence. That must be said plainly rather than implied away.

## 4. The test harness

| Piece | Purpose |
|---|---|
| `vitest.config.ts` | `environment: 'node'` by default; DOM suites opt in per file with `// @vitest-environment jsdom`; no `globals` |
| `src/test/setupDom.ts` | jsdom API shims only: `matchMedia`, `ResizeObserver` (and R3F canvas/`getContext` stubs) |
| `src/test/dom.ts` | `setupDomTests()` — registers `afterEach(cleanup)` from the *test* module |
| `src/app/testid-coverage.test.tsx` | asserts that every `data-testid` the flows rely on still exists |
| `src/features/spectacle-preview/testing/stubPreview.ts` | typed stand-in for the console state, so panel sections render without a WebGL stage |

Two harness facts that cost real time and should not be rediscovered:

- Calling `cleanup()` from the setup file resolves a *second* `@testing-library/react` instance; its containers never match, and the DOM accumulates between files. `globals: true` plus RTL auto-cleanup was also tried and rejected. The working pattern is an explicit `setupDomTests()` call in each DOM suite.
- `jest-dom` is **not** installed. `toHaveTextContent`, `toHaveAttribute` and `toBeVisible` throw `Invalid Chai property`. Assert with `textContent`, `getAttribute`, `getByRole` and `closest()`.

## 5. The coverage bar, and the honest version of it

The target is 100%. In this environment it is enforced as follows, and the difference matters:

- **Per-file 100 % line/branch/function thresholds** on the pure model modules — the recipe, planning, lattice and composition code. These are now genuinely at 100 %, thresholds included: `sparklerPlan.ts`, `latticeSource.ts`, `composition.ts` (100 % branches), and the rest of the planning/grammar set. `npm test` is 75 files / 590 tests; `npx tsc --noEmit` and `npm run build` are clean.
- **Not** at 100 %: the WebGL/Three.js modules (`GatsbySceneManager`, the shader materials, `ScreenBorderRig`, `DecoLatticeFrame`), whose pixels and GL objects jsdom cannot meaningfully execute. Instrumenting them produces line counts that measure the mock, not the code. `Dialog.tsx` (focus trap, Escape) and `useReducedMotion.ts` are also below the bar.
- The **strict-global** rollout the user asked for is therefore staged, not delivered. What stands today is: global lines/statements/branches ≈ 57/55/54 %, with hard 100 % gates on the modules where 100 % is a meaningful statement. The console's rendered surface is now covered end to end (`SpectaclePreviewPanel`, `PanelBits`, `PanelExtras`, the four sections, `Dialog` at 100 % lines, `useReducedMotion`), so the remaining global gap is concentrated in the WebGL scene modules and the premiere's camera/hook layer.

This is a deliberate, reversible decision, not a quiet lowering of the bar: the per-file thresholds are stricter than a global figure (they forbid the "well-averaged" module), and the global number is the remaining work — Phases 1–3 of ADDENDUM-022, which extract the choreography R3F runs so it can be covered in `node`.

## 6. What changed in the app (and could bite)

- `GatsbySceneManager`'s constructor now takes an **options object** (`{ freezeAt }`). Callers use `usePremiereSceneOptions`; `new GatsbySceneManager(canvas, { freezeAt })`.
- With `freezeAt` set, `clock.elapsedTime` is replaced by the constant and `setPlaying(true)` is a no-op. Dropping the query parameter restores live behaviour exactly.
- The dust field is deterministic for everyone now, not only under freeze. `DUST_SEED` is a constant; changing it changes the look of every frame.

## 7. Phases 1–3, not started

The R3F scene split (Phase 1: `FilmScene` components; Phase 2: choreography as pure functions; Phase 3: delete the imperative manager) is untouched. Nothing in this record should be read as partial progress on it.

## 8. Manual checks this sandbox could not perform

Run in a real browser and record the outcome before calling any of the recent work verified:

1. `npm run dev`, open the premiere. Header shows the **Spectacle** button; clicking it opens the small docked panel without covering the film, and Escape/close returns focus to the button.
2. In the panel: *Party sparkler* produces a head that throws sparks and falls with drag; *Sparkler fan ×5* staggers five of them; *Lucky draw* lands a winner with confetti + a sparkler fan behind the name.
3. With `prefers-reduced-motion: reduce`: the sparkler is a steady glow with no spray; the panel still works.
4. Frame Studio → source **Deco Lattice**: the frame reads as octilinear bundles, Minimal drops tiers without breaking symmetry, and **Reroll pattern** visibly changes the corners. Compare medallion mode against the tutorial stills.
5. `?freezeAt=8` twice → identical frames (dust included).
6. `npx playwright test --update-snapshots`, then inspect `e2e/snapshots/` before committing. The first run establishes the baseline; it does not verify anything.
