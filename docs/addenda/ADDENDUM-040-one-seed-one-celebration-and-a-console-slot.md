# ADDENDUM-040 — One default seed, one winner celebration, and a slot in the spectacle console (modularity review, Finding 4, parts A and B)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §7; CLAUDE.md §5, §6; `docs/modularity-review/2026-10-26/modularity-review.md` (Issue 4); ADDENDUM-020, ADDENDUM-032.
**Status:** Implemented for 4A and 4B and the panel slot. **4C (moving the Deco Lattice and Gold UI sections out of the shared console into Event Night) is not done** (§4). Type-checks, tests pass, coverage holds at 100 %; nothing rendered in a browser (none in the sandbox), so visual verification is pending.

## 1. What was decided

**4A — one default seed.** `DEFAULT_SEED = 1925` lives in `shared/lib/random.ts` ("arbitrary but fixed: the year the novel was published"). Every site that meant "the default seed" now imports it instead of writing `1925`: the spectacle effects (fireworks ×3, show, champagne, searchlights, confetti), the sparkler plan, the Deco Lattice (composition ×2, presets ×4, paths hook), the console's stage settings and lattice controls, the lucky draw's frame request, and the premiere's celebration seed. The exported names other code and tests already use (`LATTICE_DEFAULT_SEED` in `art-deco-frame` and `frame-studio`, `DEFAULT_SCREEN_BORDER_SEED`, `DEFAULT_SPARKLER_SEED`, `LEAF_SEED`) stay and now alias it, so no import changes. Two uses are **not** defaults and were left as literals: `hash01(pair, 1925)` in `sparkSpray.ts` and `1925 + index * 7919` in `sparklerTransitionEffect.ts` are hash and offset inputs, and changing them would move the golden spark recordings.

**4B — one winner celebration.** `spectacle/model/winnerCelebration.ts` is a pure plan: `winnerCelebration({ winner, seed, sparklerCount })` returns the confetti burst, the optional sparkler fan and the name reveal, and `playWinnerCelebration(play, plan)` plays them in that order. `DEFAULT_WINNER_SUBTITLE` is defined once. The premiere host uses it with the default seed and five sparklers; Event Night with a time-based seed and none; the console's demo button uses the shared subtitle. The two hosts still differ on purpose; the difference is now two arguments in one call, not two copies of the recipe.

**Panel slot.** `SpectaclePreviewPanel` takes optional `children`, rendered after its own sections, so a host can add controls without the console knowing about them.

## 2. Why

The review found the winner moment written three times with different seeds and sparkler counts, and `1925` declared in about 20 places across 8 features, with `LATTICE_DEFAULT_SEED` defined twice. A change to either had no single home.

## 3. Practical impact / what a future reader must know

- Behaviour is unchanged. Every guarded `play` assertion in `usePremiereSpectacle`, `useEventNight` and `useSpectaclePreview` still passes with its assertions untouched; no snapshot or golden recording moved. Three of those test files mock the whole `@/features/spectacle` barrel, so their mocks became partial mocks that keep the real exports (they would otherwise miss the new ones).
- To change what a winner celebration looks like, edit `winnerCelebration.ts`; to change which one a screen gets, change its arguments.
- `DEFAULT_SEED` is for "no seed given". A caller that picks a seed (the premiere's celebration, Event Night's time-based one) still passes its own.

## 4. What is not done: 4C

The review also found that the console carries the Deco Lattice controls and the gold nav-bar editor, which only Event Night uses. Moving them into Event Night is **not** in this change. Reasons: it removes two visible sections from the premiere's console (a product change that nobody has recorded a decision on), and it touches about 14 test files that build the console's state through `useSpectaclePreview`, `stubPreview` and four different mock styles in Event Night's stage tests, so doing it quickly risks silently dropping coverage. The slot above is the first step; the move itself should be its own change with a decision on the premiere console.

## 5. Validation actually performed

`npx tsc --noEmit` clean; `npm run test:coverage`: 589 files, 4327 tests pass, statements 100 % (5441), branches 100 % (1895), functions 100 % (1286), lines 100 % (4745). `winnerCelebration.test.ts` and the `DEFAULT_SEED` and panel-slot tests were written first and failed before the code. `grep` for `1925` over non-test source leaves the shared definition, the two hash/offset literals, and two doc comments. Browser, e2e and the likeness gate were not run.
