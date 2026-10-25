# ADDENDUM-037 — Frame-style rules have one owner: `art-deco-frame` (modularity review, Finding 1)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §6; CLAUDE.md §5, §6; `docs/modularity-review/2026-10-26/modularity-review.md` (Issue 1).
**Status:** Implemented. Type-checks, tests pass, coverage holds at 100 %, builds; nothing rendered in a browser (none in the sandbox), so visual verification is pending.

## 1. What was decided

What counts as a legal frame style is `art-deco-frame`'s knowledge. Three features each encoded it; now one module does (`engine/frameGrammar/styleRules.ts`, exported from the feature barrel):

| Export | Rule |
|---|---|
| `clampFormulaLevel(level)` | A whole number from `GENESIS_LEVEL_MIN` (1) to `GENESIS_LEVEL_MAX` (4). A value that is not finite (NaN, ±Infinity) is invalid input, not a request for an extreme, and gets `DEFAULT_FRAME_FORMULA.level` (2). |
| `clampIntricacy(value)` | 0 to 1; NaN gets the film baseline. |
| `normalizeFrameStyle(style)` | A copy with intricacy, level, genome and every layer level held to range. **Spreads the formula first**, so a field added to `FrameFormula` passes through. |
| `normalizeScreenBorderStyle(style)` | A copy with weight (0 to 1, NaN gets the default weight) and genome held to range; `pattern`, `seed` and any other field pass through. |

Removed copies: `clampGenesisLevel` (`generative.ts`), the inline `Math.min(4, …)` in `latticeSource.ts`, `clampFormulaLevel` / `clampIntricacy` / `clampFrameStyle` / `clampScreenBorderStyle` in `premiere/scene/styleClamp.ts`, and `clampLayerLevel` with its three constants in `frame-studio/model/studioFormula.ts`. The two Frame Studio sliders now take their bounds from `GENESIS_LEVEL_MIN` / `GENESIS_LEVEL_MAX`, which existed in `types.ts` but were used nowhere.

## 2. Why

The review found the "level is 1 to 4" rule written three times with three different answers to invalid input, and `premiere`'s `clampFrameStyle` rebuilt the formula field by field, so any new field was dropped on its way into the scene (the screen-border clamp had already lost `pattern` and `seed` that way once). This area is the most volatile in the project and the reuse plan puts every feature boundary at high distance, so the rule has to live where it will be changed.

## 3. Behaviour changes (the only ones)

| Input | Before | After |
|---|---|---|
| `level` NaN, premiere scene | 1 | 2 |
| `level` +Infinity, premiere scene | 4 | 2 |
| `level` -Infinity, premiere scene | 1 | 2 |
| layer `level` NaN, Frame Studio | NaN (passed through) | 2 |
| `normalizeFrameStyle` with an unknown formula field | dropped | kept |

Every finite input gives the same result as before. `clampGenesisLevel`'s existing non-finite → 2 behaviour is unchanged. No snapshot or golden file moved.

## 4. Practical impact / what a future reader must know

- To change what a legal frame style is, edit `styleRules.ts` and its test; `premiere` and `frame-studio` need no change.
- `premiere/scene/styleClamp.ts` now holds only playback clamps (time, chapter index, chapter jump).
- The premiere's store calls `normalizeFrameStyle` / `normalizeScreenBorderStyle` on every style it accepts, exactly where it called the old clamps.
- Not done, deliberately: the Deco Lattice has its own 1 to 4 layer count (`deco-lattice/model/composition.ts`, `nineSlice.ts`) with its own default. It is a separate module's contract and was left alone; consolidating it would change a third feature's behaviour.
- Test files: the cases from `premiere/scene/styleClamp{,.p2,.p3,.p5,.p6}.test.ts` and the Frame Studio's level cases now live in `styleRules.test.ts`. `styleClamp.p2.test.ts` and `styleClamp.p3.test.ts` held only frame-style cases and were deleted; the others kept their playback cases. 18 tests fewer than the 4320 baseline, all duplicates of a case in `styleRules.test.ts`.

## 5. Validation actually performed

`npx tsc --noEmit` clean; `npm run test:coverage`: 584 files, 4302 tests pass, statements 100 % (5425), branches 100 % (1891), functions 100 % (1276), lines 100 % (4736); `npm run build` succeeds. `styleRules.test.ts` was written first and failed on the missing module before the implementation. Browser, e2e and the likeness gate were not run.
