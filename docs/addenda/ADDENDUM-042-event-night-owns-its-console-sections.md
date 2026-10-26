# ADDENDUM-042 — Event Night owns its lattice and gold-nav console sections (modularity review, Finding 4, part C)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §7; CLAUDE.md §5, §6; `docs/modularity-review/2026-10-26/modularity-review.md` (Issue 4); completes ADDENDUM-040 §4.
**Status:** Implemented. Type-checks, tests pass, coverage holds at 100 %, builds; **nothing rendered in a browser (none in the sandbox), and this one changes what a screen shows**, so the premiere console and the Event Night console both want a look.

## 1. What was decided

The spectacle console carried two sections, **GOLD UI KIT** (an editor for the nav bar's "emoji,label" lines with a live sample bar) and **DECO LATTICE** (density, layers and a seed reroll), whose state only the Event Night screen reads: the title medallion takes the lattice settings and the bottom nav bar takes the edited items. The premiere has neither, so on the premiere those two sections edited nothing visible.

They now belong to Event Night:

| Moved | From | To |
|---|---|---|
| `useLatticeControls`, `useGoldUiLines` | `spectacle-preview/hooks` | `event-night/hooks` |
| `GoldUiSection`, `LatticeSection` (props narrowed to the one hook each uses) | `spectacle-preview/components/PanelExtras.tsx` (deleted) | `event-night/components/EventNightConsoleSections.tsx` |
| `DEFAULT_NAV_LINES` | `spectacle-preview/data/previewCatalogue.ts` | `event-night/data/navLines.ts` |
| the test ids `spectacle-preview__nav-lines`, `__nav-issues`, `__lattice-density`, `__lattice-level`, `__lattice-reroll` | | `event-night__nav-lines`, `__nav-issues`, `__lattice-density`, `__lattice-level`, `__lattice-reroll` (CLAUDE.md §5) |

`SpectaclePreviewPanel` renders host sections through its `children` slot (ADDENDUM-040), and `EventNightStage` passes the two sections there, so the Event Night console looks the same as before. `spectacle-preview` exports `Section` and `SliderRow` so a host can build sections in the console's own style. `useSpectaclePreview` and `stubPreview` no longer carry the nav or lattice fields, and `spectacle-preview` no longer imports `gilded-ui`.

## 2. The product change

**The premiere's console no longer shows GOLD UI KIT or DECO LATTICE.** On Event Night they are still there, in the same place, with the same controls. This was in the plan that was approved and was the one decision flagged for veto; I found no record of anyone choosing to put them on the premiere (ADDENDUM-032 does not mention them), but an absence of a record is not a decision, so this is the line to reverse if it was wrong: add the two sections and their two hooks back to the premiere's spectacle overlay, as Event Night does.

## 3. Practical impact / what a future reader must know

- `EventNightStage` was over its recorded size ceiling after taking on the two hooks, so its decisions moved to `hooks/useEventNightStage.ts` ("a component renders, a hook decides") and it dropped to 43 lines, below the limit. Its debt row is deleted, as is `stubPreview`'s (which shrank below the limit when the fields left). `DISCIPLINE_DEBT` goes from 49 rows to 47 and the test's ceiling from 49 to 47: the first time this work has paid debt down.
- The cases from four console test files that were really about the two hooks (`previewHooks`, `usePreviewControls`, `useSpectaclePreviewHooks`, `useSpectaclePreview`) and three about the sections (`SpectaclePreviewPanel.p3/.p6`, `spectaclePreviewComponents`) were ported to `event-night/hooks/eventNightControls.test.ts` and `event-night/components/EventNightConsoleSections.test.tsx` with their assertions, plus two new ones (the layers `<select>` offers one to four, and a stable `rerollLattice`). A new console test asserts the console does **not** carry the two sections, so the decision is in a test, not only in this file.
- The Event Night stage tests mocked `@/features/gilded-ui` with two exports; the stage now calls the real nav parsing, so those mocks became partial mocks that keep the real exports. The `p6` stage test now mocks the two moved hooks at their module paths and asserts the medallion receives the lattice settings from them.
- The dependency table in `featureBoundaries.test.ts` loses `spectacle-preview -> gilded-ui`, which nothing imports any more; `event-night -> spectacle-preview` and `-> gilded-ui` were already declared and are still used.

- `Section` and `SliderRow` are now exported from the `spectacle-preview` barrel so Event Night can build sections in the console's own look. That makes the console's panel markup a cross-feature contract. The alternative, moving them to `shared/ui`, would put gold-bordered console styling into primitives CLAUDE.md §6 reserves for reusable interaction controls, so it was not done; the trade is a known one and `featureBoundaries.test.ts` already allows `event-night -> spectacle-preview`.
- Three tests pin what the move would otherwise leave unguarded, each seen to fail when the line it protects was broken: `EventNightStage.p6` (both sections mount in the console and receive the stage's own controls), `PremiereSurfaces` (the Frame Studio is handed the controller's `getSceneApi`; see ADDENDUM-039), and the console test that it does not carry the sections.

## 4. Validation actually performed

`npx tsc --noEmit` clean; `npm run test:coverage`: 594 files, 4333 tests pass, statements 100 % (5452), branches 100 % (1895), functions 100 % (1288), lines 100 % (4756); `npm run build` succeeds; `discipline.test.ts` passes at 47 rows. Browser, e2e and the likeness gate were not run: the console was not seen on either screen.
