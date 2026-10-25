# ADDENDUM-032 — Party sparklers and the premiere spectacle console (Phase 5)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §5, §7; CLAUDE.md §2, §5, §6, §7. Implements the sparkler and console parts of ADDENDUM-020/023/024 as integrated by ADDENDUM-027.
**Status:** Implemented and unit-tested. **Nothing here has been seen in a browser.** The sparkler look, the transition's new head and wire, and the console's placement over the premiere are verified only by drawing into a recording context and by DOM tests. Visual verification pending.

## 1. What was decided / done

The brief called the transition's flying "orbs" **party sparklers**. Five PRs answered that differently; this phase takes the best of each and rejects the rest.

| Item | Where | Base | Taken from the others |
|---|---|---|---|
| Plan | `spectacle/model/sparklerPlan.ts` | PR #6 (seeded recipes, fan of 1 to 5, heat envelope, emission from absolute time) | duration hardening is new (§3) |
| Standalone effect | `effects/sparklers/sparklersEffect.ts`, `sparklerRenderer.ts` | PR #6 (91-line effect, shared renderer) | PR #2's 244-line effect not taken |
| Wand and spray | `sparklerWand.ts`, `sparkSpray.ts` | PR #2 (pure modules) | tests rewritten, stricter |
| Transition | `sparklerTransitionEffect.ts` + `transitionPose`, `sparklerWire`, `transitionFlash` | PR #2's choreography split into four small modules | `orbPlan` untouched |
| Naming | `sparkler-transition` with `orb-transition` as a deprecated alias of the **same definition** | PRs #2 and #5 | PR #6's second, restyled orbs effect rejected (two code paths) |
| Console | `CelebrationSection`, `SPARKLER_DEMOS`, `playSparklers` | PR #6 | focused section test is new |
| Overlays | `OriginCrosshair`, `PickOriginHint`, `KeepClearSpeaker`, `useSpeakerDrag` moved to `spectacle-preview` | PR #2 (only PR that moved them) | PR #6's drag tests |
| Premiere host | `GatsbyPremiere` (provider shell), `PremiereSurfaces`, `usePremiereSpectacle`, `PremiereSpectacleOverlay`, header launcher slot | PR #6 | extra real-stack test |

## 2. Decisions that were not ports

- **PR #5's `celebration-overlay` launcher and catalogue were not taken.** The console already offers every one of its actions as a typed effect call (the four sparkler transitions, fireworks, confetti burst and rain, sunburst, countdown into the finale, champagne, searchlights). A second control for the same effects would be two ways to do one thing, and the plan said to keep one launcher.
- **PR #4's `sparklerSettings` was not taken.** It clamps settings this plan does not have (a `spread`, and a count of up to 6 against the plan's 5). Adding either would be new behaviour.
- **Correction to an earlier claim:** my plan credited PRs #3 and #6 with moving the overlay helpers. Only PR #2 did.
- **Plan integrity.** `orbPlan.ts` is unchanged: PR #2's renamed plan, diffed after un-renaming, differs from `main` only in comments. The cover point, the crossfade and `onCovered` are pinned by new tests rather than assumed.

## 3. Defects found

| Defect | How it was found |
|---|---|
| A sparkler given a `NaN` duration has `NaN` heat, and an infinite one never finishes, so the effect would hold a canvas and a 1400-slot pool for the life of the page. Durations are now finite and held between 800 ms and 30 s | Reading PR #4's clamp against what the plan accepted, then a probe |
| The lucky-draw dialog did not block the premiere's keyboard shortcuts, so typing a guest name would also scrub or pause the film | Mutation: removing the check passed all of PR #6's tests |
| The header launcher could open the console but never close it | Mutation, same |
| The fan's outer sparklers sit higher than the centre one, and nothing asserted it | Mutation on PR #6's plan, which has 100% line coverage |
| PR #6 shipped the effect, renderer-facing wiring and console with no test for the effect itself | Writing one: 13 tests, then 5 more after three mutations survived |

## 4. Golden changes

Only the effect recordings moved: **four new sparkler entries, and the four full-motion orb transitions** (calls and hash), because the head is now a sparkler. The other 30 entries, including every reduced-motion orb, are byte-identical. The lattice, premiere and authored goldens did not change.

## 5. What a future reader must know

- **Never seen.** Sparkler heads, wires, sparks, rings and the console are drawn only into `createRecordingContext` and asserted as calls. A person needs to run `npm run dev`, open the console from the header, and look.
- **Both shipped quality tiers cap sparks (2000 and 6000) above the sparkler effect's own 1400 ceiling,** so they differ only in trail sampling. A test with a smaller injected cap covers the cap.
- `ActionButton` in the console shows "playing" by colour alone and carries no `aria-pressed`; recorded for Phase 6.
- The premiere is now wrapped in one `SpectacleProvider` (a layer `div` owns the effect canvases and an `aria-live` region). `h-dvh`/`w-screen` moved to that wrapper; the stage and HUD are `h-full w-full` inside it.
- Mutation checking was done by hand and is not a CI step: about 45 distinct deliberate breaks (about 60 runs, counting re-runs after a test was added) across the plan, effect, transition, wand, spray, drag hook, shell and duration clamp, each required to fail a test. Every break that survived a first draft drove a new test; the last state has none surviving among those tried. That is not proof the suite catches everything, only that it catches these.
- Coverage floors ratchet to 81 / 75 / 76 / 82 (measured 81.1 / 75.7 / 76.9 / 82.2). New named 100 percent thresholds: `sparklerPlan`, `sparklerWand`, `sparkSpray`, `transitionPose`, `transitionFlash`, `sparklerWire`, `sparklerTransitionEffect`, `sparklersEffect`, `sparklerRenderer`, `effectRegistry`, `useSpeakerDrag`.
- Not yet triaged: PR #6's remaining spectacle tests (scheduler, layers, stage, provider, geometry, digest) are Phase T work.

## 6. Validation actually performed

`npx tsc --noEmit` clean; `npm test` 1267 tests pass; `npm run test:coverage` passes its gates; `npm run build` succeeds. **Not done:** any browser run, any GPU or canvas rendering of the new effects, any look at the console over the premiere. Visual verification pending.
