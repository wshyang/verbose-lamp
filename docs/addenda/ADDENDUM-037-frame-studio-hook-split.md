# ADDENDUM-037 — The frame studio hook, split into four decisions

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4; ADDENDUM-035 (the panel
this hook feeds); ADDENDUM-032 (the ratchet that named it).
**Status:** Implemented — recorded debt 53 → **52**; `useFrameStudio` 180 → 33 lines,
and the transitions are now a pure module with their own tests.
**Audience:** anyone editing studio behaviour, and anyone who has to add a fifth knob.

## 1. Why a hook that works still needed splitting

`useFrameStudio` was 180 lines and **fully tested** — 15 hook tests, every one asserting
observable behaviour through `renderHook`. So it was not failing in the way the last two
components were. It was failing in a quieter way: it held four unrelated jobs at once —

1. the sequence frame's draft (formula + intricacy) and the eight edits that commit it,
2. the screen border's style, visibility and two edits,
3. the panel's own chrome (open, surface, proportions drawer, the `F` key),
4. the derived readout the panel renders (layer rows, design badge, preset, percentages).

Each job has a different reason to change, and three of the four were pure arithmetic
wearing a `useCallback` costume. The hook also duplicated its clamping (`Math.min(4, …)`
in two places, `Math.round(value * 100)` in three), which is exactly how a clamp ends up
applied on one surface and forgotten on the other.

## 2. Where the code went

| Module | Contains |
|---|---|
| `model/frameDraft.ts` | the draft type, the defaults, and **every transition**: `withPattern`, `withDesign`, `withGene`, `withLayer`, `withLevel`, `withDetail`, `withBorderWeight`, `withBorderGene`, plus `layerOptionsOf`, `designEntryOf`, `designLabelOf`, `activePresetOf`, `detailPercent`/`detailValue`, `clampLayerLevel` |
| `model/target.ts` | `FrameStudioTarget`, the port the host implements (was buried in the hook file) |
| `hooks/useSequenceFrame.ts` | one `useState` + one `commit` + eight one-line mutators |
| `hooks/useScreenBorder.ts` | the border's style and visibility, `setWeight`, `setGene`, `restore` |
| `hooks/usePanelVisibility.ts` | open/dismiss/reveal and the `F` hotkey with its input guard |
| `hooks/useStudioView.ts` | everything the panel *reads*, memoised per input |
| `hooks/useFrameStudio.ts` | 33 lines: composes the four, wires surface switching and `resetAll`, returns one flat object |

The transitions are now ordinary functions with ≤3 parameters and no React in sight, so
`model/frameDraft.test.ts` (14 tests) can assert the rules that were previously only
implied by a hook test with a fake renderer:

- switching a pattern **disables the matching overlay layer** but leaves the others alone;
- switching *to* a generative pattern keeps the level, switching back to `authored`
  restores the authored level;
- a hand-tuned gene **drops the design badge**, and a clamped gallery genome does not;
- the design badge only exists on the authored foundation;
- `detailValue` clamps at both ends, `detailPercent` rounds, `activePresetOf` returns
  `null` between the named presets;
- every caller gets its own mutable default formula — mutating one must not leak into the
  next (the old `defaultFrameFormula()` was already correct here; now it is pinned).

## 3. What was deliberately preserved, quirk and all

The refactor is behavioural identity, and three details prove it matters:

- **`resetAll` does not push the border style.** The original reset called the border's
  `setBorder` directly and only told the renderer about `setScreenBorderEnabled(false)`.
  A "cleaner" implementation that diffed state and synced everything would have sent an
  extra `setScreenBorderStyle` on reset. That is a different renderer contract, so the
  direct `restore()` was kept and named for what it does.
- **`setSurface('screen-border')` still turns the border on**, but only when it is
  currently off — asserted by the existing test that pressing through surfaces does not
  re-enable an already-on border.
- **`setLevel` still does not clamp.** Only layer levels clamp. That asymmetry is the
  panel's contract (`RangeInput` already bounds the base level) and changing it here
  would be a product change smuggled in as tidying.

All 15 hook tests and both component suites passed **without edits**, which is the
evidence that the split is a move rather than a redesign.

## 4. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **126 files, 1184 tests**, green (15 hook + 13 panel + 14 new
  transition tests + the rest unchanged).
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines across all
  five new modules.
- `npm run build` — succeeds.
- `src/discipline.test.ts` — 6 tests; `DISCIPLINE_DEBT.length ≤ 52`; the
  `useFrameStudio` row is gone (180 → 33 lines).

## 5. Where the debt now stands

**52 recorded functions remain**, and none of them is logic that a headless test can
disprove a refactor of:

- 24 `component` / `render-rig` functions in the classic Three.js layer, most of which
  disappear with `GatsbySceneManager` when the screenshot gate passes (ADDENDUM-026 §5);
- 16 `geometry-primitive` signatures whose parameters *are* coordinates;
- the remaining hooks (`usePhotoSession` 74, `usePremiereController` 71,
  `usePremiereRuntime` 70) — each already tested, each the next candidate for exactly
  this treatment;
- a handful of long-but-linear orchestrators.

**No browser in this sandbox; visual verification pending.** Nothing in this round moved
a pixel — but the same caveat applies to the whole programme: the studio is verified by
tests and goldens, not by looking at it.
