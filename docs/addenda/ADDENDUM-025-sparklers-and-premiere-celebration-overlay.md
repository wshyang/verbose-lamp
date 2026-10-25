# ADDENDUM-025 — "Orbs" are party sparklers; celebration overlay on the premiere

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §3, §7; ADDENDUM-020 §3.4 (orb transitions),
ADDENDUM-023/024 (spectacle port); CLAUDE.md §1, §2, §5, §6.
**Status:** Implemented — visual check pending.

## 1. What was decided

1. The spectacle effect historically called "orb transition" depicts **party sparklers**, not
   glowing balls. Sarah & Jeff clarified this after ADDENDUM-024 shipped. The effect is renamed
   **sparkler transition** in every user-facing label, and the head is re-rendered as a sparkler:
   a white-hot point with hairline crackle sparks in all directions and a glittering shed-spark
   trail, replacing the soft fireball gradients and flame tongues.
2. The spectacle effects are now reachable **on the main premiere itself** — the original
   ADDENDUM-020 ask ("a small preview overlay in the demo app"), which ADDENDUM-024 only
   delivered on the separate Event Night screen. A **Celebrate** header button opens a small
   non-modal overlay; effects play over the live WebGL stage.

| Piece | Where |
|---|---|
| Pure crackle geometry + emissions | `spectacle/effects/sparklers/sparklerCrackle.ts` (+ test) |
| Sparkler renderer | `spectacle/effects/sparklers/sparklersEffect.ts` |
| Sparkler plan names | `spectacle/effects/sparklers/sparklerPlan.ts` (aliases of the proven orb plan) |
| New effect id | `'sparkler-transition'` in `EffectParamsMap` + registry |
| Legacy compatibility | `'orb-transition'` id, `orbsEffect`, `OrbTransitionParams`, `ORB_DEMOS`, `playOrb` all still work |
| Celebration catalogue (pure) | `src/features/celebration-overlay/model/celebrationActions.ts` (+ test) |
| Celebration decisions | `celebration-overlay/hooks/useCelebrationOverlay.ts` |
| Button + small overlay | `celebration-overlay/components/CelebrationLauncher.tsx` |
| Premiere wiring | `GatsbyPremiere` mounts a `SpectacleProvider`; header gains the launcher |

## 2. Why

- Sarah & Jeff correction is about what the effect *is*, so copy that says "orbs" misdescribes the
  product. But `'orb-transition'` is a published API of the spectacle barrel; renaming it
  destructively would break callers. The sparkler name became canonical in copy and in a new
  id, with the old id kept as an alias of the same definition.
- The choreography (flash plateau, `onCovered`, flight arcs, collision) was never wrong, so
  the pure plan is untouched apart from aliased names — its golden snapshots are unchanged.
  Only the head drawing changed, which is why only the four sparkler cases in
  `effects.golden.test.ts` were re-baselined (draw-call logs legitimately differ; two cases
  still run through the legacy id to prove the alias draws the sparklers too).
- On the premiere, the spectacle light-backdrop sits above the WebGL canvas and below the HUD,
  so fireworks/champagne never hide the title cards (ADDENDUM-020's rule), while transition
  flashes use the light overlay as before. The premiere's Three.js scene is untouched.

## 3. Relation to the base spec

BUILD_PROMPT §3 (visual language) and §7 (surfaces). Implements the main-app half of
ADDENDUM-020 §1/§3.1 that ADDENDUM-024 deferred to the Event Night screen. Where the plans
said "orb", Sarah & Jeff reading ("party sparklers with the sparkling effect") wins; recorded here
per CLAUDE.md §1.

## 4. Practical impact / future reader

- New callers: `play('sparkler-transition', …)`. Anything still calling `'orb-transition'`
  keeps working and now gets sparklers.
- The crackle is deterministic per 45 ms bucket (`sparklerBurstAt`), so golden recordings stay
  stable; loose sparks carry `glitterRate` so trails twinkle out instead of fading like smoke.
- The celebration catalogue is pure data + typed `EffectCall`s; any host with a spectacle
  stage can reuse it without the launcher UI.
- Backdrop actions are toggles (champagne, searchlights, continuous fireworks); everything
  else plays out once. Countdown chains a fireworks finale from the hook.
- Also fixed here: `planning.golden.test.ts` digests now round floats to 6 dp before hashing.
  The previous raw `JSON.stringify` digest passed on macOS and failed on Linux (last-bit
  `Math` differences), which is a test-harness bug, not a recipe change. All 24 planning
  snapshots were re-baselined for the new digest only.

## 5. Validation actually performed

- Tests first for `sparklerCrackle` (determinism, ray budget, full-circle spread, trail bias)
  and `celebrationActions` (every action builds a typed call; unknown id → null; grouping).
- `planSparklerTransition`/`planSparklerCrossfade` proven identical to the orb plan in
  `orbPlan.test.ts`.
- `npx tsc --noEmit` ✓; targeted vitest (sparklers, orbs, effects golden, celebration) ✓.

**Caveat:** no browser was available when this was written. It type-checks and tests pass;
the sparkler look and overlay placement need a visual check (`npm run dev`, click **Celebrate**).
