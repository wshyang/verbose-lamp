# ADDENDUM-036 — Two modals: the title customizer and the research dossier

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4; ADDENDUM-035 (the same
method on the studio panel); ADDENDUM-033 §4.
**Status:** Implemented — recorded debt 55 → **53**; `CustomTitleModal` 182 → 28 lines,
`ResearchModal` 161 → 28 lines.
**Audience:** anyone editing the two dialogs, and anyone who wonders what a golden
snapshot is actually buying.

## 1. Two dialogs, two different problems

They were the last two large untested-or-thinly-tested components named by the ratchet,
and they were failing in opposite ways:

- **`CustomTitleModal` (182 lines) had seven behaviour tests and no structural one.**
  The tests proved the form worked; nothing proved the form was still *the form*. A
  field could lose its label association, a test id could migrate, or a whole block
  could disappear, and every one of those tests would still pass.
- **`ResearchModal` (161 lines) had no test at all.** It is a read-only dossier: three
  hand-drawn SVG plates and a data-driven section grid. The risk is content drift — a
  caption, a credit line, a bullet — which is exactly what a text digest catches.

## 2. The pins

**`CustomTitleModal.test.tsx`** gained a `describeDialog()` helper that records, in
document order, every `[data-testid]` with its tag, its `value`/`checked` state and its
text, plus each `label[for]` pair and the `h2` id/text. Whitespace is collapsed before
hashing: the assertions are about wording and order, not about how deeply the markup is
indented (a first attempt compared raw `textContent` and would have failed purely on
re-indentation, which is not a regression). It also gained two behaviour tests — the
preset count and the pinstripe checkbox starting from the config.

**`ResearchModal.test.tsx`** is new (5 tests) and records the *whole* dossier text plus
its shape: 5 `svg` elements of which 3 are the 220×90 plates, the `path`/`rect`/`circle`/
`text` count, the `li` count, the `h2`/`h3` list, and the test ids. Plus: renders nothing
when closed, draws one card per section with its title and `SECTION NN`, closes from the
button, closes on Escape.

## 3. What the pins found before a line moved

- **The pinstripe toggle was never exercised.** `useTitleDraft`'s `setPinstripe` had no
  caller in any test — coverage of the new hook was 75 % functions and caught it at once.
  A new test flips the checkbox and asserts the applied config, which is a real
  behaviour that nobody had ever checked.
- **`ResearchModal` renders five SVGs, not three.** The three plates are 220×90; the
  other two are the lucide sparkles and close glyphs. The first version of the test
  asserted three and failed, which is the sort of thing a digest alone would have
  silently accepted — so the plate count is now asserted by `viewBox`, and the icon
  count is asserted explicitly with a comment saying why.

## 4. The splits

**Title customizer** — the draft moved out of the component entirely:

| File | Role |
|---|---|
| `hooks/useTitleDraft.ts` | holds the working copy; re-seeds on open; `setText` upper-cases as you type, `setPinstripe`, `applyPreset`, `reset` |
| `components/dialog/ModalHeader.tsx` | corner marks, eyebrow, title, close |
| `components/dialog/PresetRow.tsx` | the archival presets |
| `components/dialog/TitleField.tsx` | one labelled text field, `standard` or `monumental` |
| `components/dialog/TitleForm.tsx` | the four fields, driven by a `FIELDS` table |
| `components/dialog/PinstripeToggle.tsx` | the alternation flag |
| `components/dialog/ModalFooter.tsx` | Reset / Render in WebGL |

The uppercase rule is worth naming: it lives in the hook, not in each input, so a new
field cannot forget it. The original applied `e.target.value.toUpperCase()` in four
separate `onChange` handlers and would have needed a fifth.

**Research dossier** — content split by kind:

| File | Role |
|---|---|
| `components/dossier/DossierHeader.tsx` | corner brackets + title bar |
| `components/dossier/DossierBody.tsx` | the scroll pane: plates, then sections |
| `components/dossier/FigureCard.tsx` | caption + drawing + note |
| `components/dossier/PinstripePlate.tsx` | Fig. I, four-stripe and chiselled glyphs |
| `components/dossier/ChamferPlate.tsx` | Fig. II, the six-facet rail |
| `components/dossier/PortalPlate.tsx` | Fig. III, the Z-corridor |
| `components/dossier/ResearchSectionCard.tsx` | one numbered section |

The plates are pure SVG with no props, so they are now the cheapest possible thing to
diff against a design reference. `ResearchModal` itself is 28 lines: a `<Dialog>` with
two children.

`TitleForm` was 80 lines on the first attempt — the ratchet caught it, and the footer and
toggle were split out until it fitted. That is the third time this round the test has
pointed at a function that "looked done".

## 5. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **125 files, 1170 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines;
  `useTitleDraft.ts` 100/100/100/100.
- `npm run build` — succeeds.
- `src/discipline.test.ts` — 6 tests; `DISCIPLINE_DEBT.length ≤ 53`.

Three inline goldens (title dialog, plus the two earlier) and one dossier digest were
captured **before** their refactors and passed **unchanged** after.

## 6. What is left of the debt

The largest remaining rows are the two renderer files that the R3F port is replacing
(`decoCards.createGatsbyCardRig` 178, `environment.createDecoWallpaperTextures` 176,
`GatsbySceneManager.buildAtmosphericWorld` 171) and the render rigs beside them, plus
`useFrameStudio` at 180 — a hook, now the biggest *logic* function in the tree, and the
next natural candidate since it can be split by concern with tests already in place.
The geometry primitives with 10–13 parameters stay as they are: the coordinates are the
content, and an options object would hide them.

**No browser in this sandbox; visual verification pending.** Neither golden can see a
Tailwind class, an SVG's stroke width, or whether the dossier scrolls. They prove the
words, the order and the element structure survived; the look is still the pending
screenshot pass's job.
