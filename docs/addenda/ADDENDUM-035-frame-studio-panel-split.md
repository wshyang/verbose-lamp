# ADDENDUM-035 — The frame studio panel, pinned then split

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4; ADDENDUM-032 (the
discipline ratchet); ADDENDUM-033 (the same method, applied to the grammar).
**Status:** Implemented — recorded debt 56 → **55**; `FrameStudioControl` 252 → 35 lines.
**Audience:** anyone editing the studio panel, and anyone wondering why a refactor with
no browser still counts as verified.

## 1. The worst kind of file

`FrameStudioControl.tsx` was **252 lines with no test of its own** — the largest
untested function in the tree. The state lived in `useFrameStudio` (tested, 40+
assertions) and the code was markup, so nothing was *wrong*; it was just a surface
nobody had pinned. That combination is where silent regressions breed: a moved
`data-testid`, a lost `aria-pressed`, a slider wired to the wrong handler, and no
jsdom test to notice.

The panel is also the studio's whole visible UI. Breaking it without a browser would
mean shipping a broken control panel and calling it verified — not acceptable.

## 2. The method: pin, then move

**Step one — write the test against the 252-line component**, before touching it.
`FrameStudioControl.test.tsx` is new, jsdom, 13 tests:

- Three **`stableDigest` goldens** of the rendered panel: title surface closed, title
  surface with the proportions drawer open, and the screen-border surface. The digest
  records every `data-testid` in document order with its tag, `aria-pressed`,
  `aria-expanded`, `disabled`, `checked` and text, plus the `role="group"` labels, the
  fieldset count and the panel's `aria-label`. That is the structure the styles and the
  e2e suite read; pixels are not asserted, because jsdom has no layout and no CSS.
- Ten behaviour tests: surface switch, foundation and design selection, layer toggle
  and per-layer level, base level, detail slider and presets, the three readout states
  (`Balanced` / preset label / `43%`), the gene drawer with an inert `fractalRatio`,
  reset and dismiss, and the border switch with its weight.

Writing it first found four things, all now recorded in the test:

1. `INTRICACY_PRESETS[0]` is `minimal`, not `baseline` — the "Balanced" label belongs
   to `baseline`, which is *third* in the list. The readout test now looks the preset up
   by id instead of by position.
2. The gene test id sits on the **wrapper div**, not the range input, so `fireEvent`
   has to reach inside (`querySelector('input')`), exactly as `useFrameStudio.test.tsx`
   already had to.
3. `isDesignPattern` **disables** the base-level slider when true and enables it when
   false — the opposite of what the surrounding `opacity-40` styling suggests at a
   glance.
4. This project has no `@testing-library/jest-dom`, so `toBeDisabled()` is not a
   matcher here; the tests assert the DOM property directly.

**Step two — split the markup, keeping the goldens.** Seven section components under
`components/studio/`, plus the shared chip style:

| Section | Reads |
|---|---|
| `StudioHeader` | `onReset`, `onDismiss` |
| `SurfaceSwitch` | `surface`, `onSurfaceChange` |
| `FoundationSection` | `patterns`, `baseSource`, `onPatternChange` |
| `DesignSection` | `designLabel`, `designGallery`, `activeDesignIndex`, `onDesignChange` |
| `LayersSection` | `layers`, `onLayerToggle`, `onLayerLevelChange` |
| `DetailSection` | `isDesignPattern`, `level`, `detailPercent`, `activePreset`, `detailPresets`, `onLevelChange`, `onDetailChange` |
| `ProportionsSection` | `proportionsOpen`, `onProportionsToggle`, `genome`, `onGeneChange` |
| `BorderSection` | `borderEnabled`, `borderWeight`, `onBorderEnabledChange`, `onBorderWeightChange` |

Each section declares `Pick<FrameStudioControlProps, ...>` rather than receiving the
whole 30-field prop object, so a section cannot quietly start depending on unrelated
studio state. `chip()` moved to `studio/chip.ts`; `detailReadout` and `inertGenes`
became small pure helpers (`detailReadoutOf`, `inertGenesOf`) inside the sections that
use them, so the parent computes nothing.

`FrameStudioControl` is now 35 lines: one `<section>`, the sections, and one boolean
(`isTitle`) that chooses between the title-card and screen-border stacks.

**Result:** all three goldens passed **unchanged** after the split, and all ten behaviour
tests kept passing — the markup moved, the tree did not.

## 3. What the split deliberately did not change

- The conditional wrappers (`{props.isDesignPattern && ...}`) stay in the parent, so the
  conditional rendering order is identical and the `props.isDesignPattern &&` guard is
  evaluated once per render rather than inside each section.
- The `<section>` chrome — position, overflow, blur, `data-testid`, `aria-label` — stays
  in the parent. It is the panel, not a section.
- No styling was touched. Every Tailwind class string was copied verbatim, including the
  long single-line ones; re-formatting them during a code-motion change would have made
  the goldens meaningless for the CSS side (they only see structure, not classes).

## 4. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **124 files, 1162 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines. (`.tsx` is
  excluded from the gate by design, which is precisely why the goldens above matter.)
- `npm run build` — succeeds.
- `src/discipline.test.ts` — 6 tests; `DISCIPLINE_DEBT.length ≤ 55`; the
  `FrameStudioControl` row is gone (252 lines → 35).

## 5. Still on the table

The same treatment is owed to the two remaining giants, both now named by the ratchet:
`CustomTitleModal` (182 lines, untested) and `ResearchModal` (161 lines), and to
`useFrameStudio` (180 lines, tested) — the last one is a hook, so it can be split by
concern rather than by markup. Each needs its pin first.

**No browser in this sandbox; visual verification pending.** The digests prove the panel
renders the same elements with the same state attributes in the same order. They cannot
prove it *looks* right: Tailwind class strings are invisible to jsdom, and a mistyped
class would sail through every assertion in this file. That check belongs to the pending
screenshot pass, alongside the frame and the scene.
