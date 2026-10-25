# ADDENDUM-027 — Testability Phase 0: deterministic frames, freeze hook, typed scene port, pure choreography, Playwright gate

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (plan, Phase 0 steps 0.1–0.5 and 0.7),
ADDENDUM-001 §3 (Playwright deferral); BUILD_PROMPT §2, §7, §9; CLAUDE.md §2, §5, §6, §7.
**Status:** Implemented — screenshot baselines are Sarah & Jeff step (see §5). Phase 1 (DOM tests)
follows in ADDENDUM-028; the R3F port (Phase 2) remains gated on Sarah & Jeff baselines.

## 1. What was decided

| Step | Landed |
|---|---|
| 0.1 Seeded PRNG | `createPrng` spelling over the existing `mulberry32` (`src/shared/lib/random.ts`); gold dust now uses `DUST_SEED = 1920` instead of `Math.random()` |
| 0.2 Freeze hook | `premiere/model/freeze.ts parseFreezeAt(search)`; manager option `freezeAt` freezes time/elapsed, ignores pointer, sets `data-frame-ready="true"` after 3 rendered frames; `usePremiereRuntime` passes `window.location.search` |
| 0.3 Typed scene port | `premiere/scene/sceneApi.ts PremiereSceneApi`; `GatsbySceneManager implements` it; all hooks retyped to the interface |
| 0.4 Testids | `cinematic-stage__canvas` on the WebGL mount (existing timeline/header ids verified) |
| 0.5 Playwright | `@playwright/test`, `playwright.config.ts` (desktop + mobile Chromium, swiftshader, video on unless `PW_VIDEO=off`), `e2e/likeness.spec.ts` (12 planned shots via `gotoFrozen`), `e2e/flows.spec.ts` (transport, chapters, HUD, modals, custom title, celebration overlay), `e2e`/`test:coverage` scripts |
| 0.7 Choreography | `premiere/scene/choreography.ts` — verbatim move of the animate-loop math; `animate()` now only applies it |
| 0.8 Record | This addendum; ADDENDUM-001's Playwright row marked un-deferred |

## 2. Why / deviations from the plan

- **One PRNG, not two.** The plan proposed a new `prng.ts`; `mulberry32` already existed for
  the spectacle and lattice engines. `createPrng` is its plan-spelling alias, with the first
  five seed-1920 values pinned in a golden test, so every load renders the identical dust.
- **`cardPhase` takes `{ localT, role }`, not `(localT, isFinale)`.** CLAUDE.md §6 forbids
  boolean-flag parameters; `role: 'standard' | 'finale'` says the same thing honestly.
  Everything else follows the plan's signatures (parameter objects where > 3 inputs).
- **The manager went 767 → 737 lines** despite gaining freeze support, because the loop
  math now lives in `choreography.ts`. Still known debt (ADDENDUM-001), not grown.
- **Video on by default** follows greenfield §3 (which Sarah & Jeff asked to abide by), with
  `PW_VIDEO=off` as the documented switch; traces retain on failure.

## 3. Relation to the base spec

BUILD_PROMPT §2/§7/§9 only: no visual or behavioural change is intended. The choreography
extraction is a verbatim move locked by a golden snapshot (every function sampled every
0.25 s over the full 38 s, floats rounded to 6 dp for cross-architecture stability) plus a
`smoothstep` parity test against `THREE.MathUtils.smoothstep`.

## 4. Practical impact / future reader

- `?freezeAt=<seconds>` is a production-harmless test affordance: it pauses on one exact
  frame. Keep it — the likeness gate (and any future R3F port) depends on it.
- Hooks can no longer reach concrete scene internals: anything React needs from a renderer
  must be added to `PremiereSceneApi` first.
- Determinism is now load-bearing: dust, choreography and freeze are pinned. If a future
  change wants random dust again, it must explain the golden churn in its addendum.

## 5. Validation actually performed

- Tests first: `freeze.test.ts`, `choreography.test.ts` (parity, boundaries, handover at
  every `startTime`, golden), `createPrng` golden values — all green.
- `npx tsc --noEmit` ✓ (e2e and the Playwright config are type-checked too),
  `npm test` ✓ (489 tests), `npm run build` ✓ (1.35 MB single file, unchanged order),
  `npx playwright test --list` ✓ (36 tests collected).
- **Not run:** the Playwright suite itself — Sarah & Jeff checkpoint 0.6. On a machine with a
  browser: `npx playwright install chromium && npm run e2e:update`, inspect
  `e2e/*-snapshots/`, commit the baselines. Only then does the R3F port (Phase 2) unblock.

**Caveat:** this sandbox has no browser (the Playwright browser CDN is unreachable). The work
type-checks, tests pass and it builds; visual verification is pending.
