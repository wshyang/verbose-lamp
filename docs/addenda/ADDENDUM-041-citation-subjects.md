# ADDENDUM-041 — Citation subjects: the 031/032 mix-up, corrected

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §4, §7; ADDENDUM-031 (defect record),
ADDENDUM-032 (the ratchet), ADDENDUM-034 §1 (how the collision happened),
ADDENDUM-040 (prose that cannot go stale).
**Status:** Implemented — four source citations corrected; one comment disambiguated.
**Audience:** anyone who cites an addendum number from code.

## 1. The defect

ADDENDUM-034 §1 recorded a numbering collision: the carve-type split was written up first,
then the Deco Lattice walk-halo defect claimed the same number, so the split became 032.
The register was fixed at the time. The **citations were not** — four source files kept
crediting 031 with work that 032 records:

| File | Was cited for | Actually |
|---|---|---|
| `src/test/disciplineBaseline.ts` | "recorded debt against the hard limits" | ADDENDUM-032 |
| `src/discipline.test.ts` | "the coding disciplines as a test" | ADDENDUM-032 |
| `src/features/art-deco-frame/render/decoTypography.ts` | the 371 → six-function split | ADDENDUM-032 §3 |
| `src/features/art-deco-frame/render/decoTypography.test.ts` | the digest pinned before that split | ADDENDUM-032 §3 |

Every one of those citations *resolved*, which is why the addenda test stayed green: it
asks whether the number exists, not whether the sentence is true. A reader following
`decoTypography.ts` was sent to a page about a missing halo and would have found no table
of six functions.

`src/addenda.test.ts`'s own header comment described the collision imprecisely ("a split
record and a defect record both citing ADDENDUM-031"); it now names the renumbering.

## 2. Why there is no test for this

The obvious guard — parse every `(ADDENDUM-0NN)` and check it against a map of
number → subject — requires a second registry of subjects, maintained by hand, and *that*
registry can go stale in exactly the way the citations did. The register's subject column
already exists and is the single source; a test that mirrors it only moves the problem.

What would actually work is semantic, and out of proportion: no fuzzy match between a
comment and a document is reliable enough to fail a build on.

So the fix is the audit, recorded here, run by one command:

```sh
grep -rn "ADDENDUM-031" --include=*.ts --include=*.tsx src
```

which now returns **nothing**, and the register row for 031 carries a §8 erratum pointing
here so a future reader of the wrong page finds the way back.

## 3. What was deliberately left alone

- **`ADDENDUM-032`'s and `ADDENDUM-033`'s references to "ADDENDUM-031 §6"** — both quote the
  lesson in §6 ("a green suite said nothing because nothing asserted it did anything") to
  make a point about prose rules that nothing enforces. That is the section they mean.
- **ADDENDUM-034 §1's description of the collision** — a historical account, and accurate.
- **`docs/ADDENDA.md`'s 031 row** — the defect is what 031 records; only §8 is new.

## 4. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **126 files, 1184 tests**, green, unchanged: the citation rule is a
  single assertion that sweeps the whole tree, so a new register row is covered without a
  new test, and no test was edited to accommodate this change.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines; the four
  edited files are comments only.
- `npm run build` — succeeds.

**No browser in this sandbox; visual verification pending.** Comments and documentation
only; nothing rendered changed.
