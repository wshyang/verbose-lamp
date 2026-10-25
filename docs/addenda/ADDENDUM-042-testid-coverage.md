# ADDENDUM-042 — Test ids are now checked across the whole tree, not one screen

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §5; ADDENDUM-001 §3 (the deferred rows);
ADDENDUM-022 §1.2 and §5 (the rendered coverage test); ADDENDUM-030 §3 (the e2e
contract); ADDENDUM-028 §6.
**Status:** Implemented — `src/app/testidCoverageStatic.test.ts`, 4 tests.
**Audience:** anyone adding a control, and anyone tempted to call a documented promise
"done".

## 1. The row that never closed

ADDENDUM-001 §3 recorded `data-testid` on pre-existing controls as **Partial**, with the
un-defer trigger "backfill when the HUD is next split". The HUD has since been split four
times; the row still read *Partial*. Nobody was being careless — there was no way to tell
whether the backfill was finished, because "does every control have an id?" was answered
by a rendered test that mounts exactly one screen.

`src/app/testidCoverage.test.tsx` (from ADDENDUM-022 §5) renders `GatsbyPremiere` with a
stubbed controller and asserts every `button, input, select, textarea` in *that* document
has an id. Good, and it caught real omissions at the time. But the avatar studio, the QR
console, the frame studio drawer and the sparkler overlays are different screens, and no
test mounts them all.

## 2. What was measured, and what it found

A static pass over `src/**/*.tsx` (tests excluded), counting intrinsic controls
(`button`, `input`, `select`, `textarea`) and call sites of the three shared primitives
(`Button`, `IconButton`, `RangeInput`):

| Control kind | Sites | Without an id |
|---|---|---|
| Intrinsic | 39 | 2 |
| Shared primitive | 55 | 1 |
| **Total** | **94** | **3** |

All three are the same thing, and it is not a defect: `Button`, `RangeInput` and
`IconButton` *receive* the id from their call site and spread it onto the element they
render, so the attribute cannot appear on the tag they own. Every one of the 94 sites a
user can actually press carries an id. **The backfill is complete** — it just had no
evidence, and ADDENDUM-001 §3 still said otherwise.

## 3. The guard

`src/app/testidCoverageStatic.test.ts`, parsing with the TypeScript compiler (the same
tool `src/discipline.test.ts` uses):

1. **It counts before it judges.** The walker must see ≥ 80 component files and ≥ 60
   controls, or the suite fails. This is the lesson from ADDENDUM-031 §6: a check that
   finds nothing must not be able to pass.
2. **Every control needs `data-testid`,** except the three recorded pass-throughs —
   each keyed `path:tag` with the reason in the source.
3. **The exemption is exact, not a blanket.** An exemption that stops being needed fails
   the build, so the list can only shrink. Same ratchet shape as the debt table.
4. **No id is repeated inside one file,** which catches the copy-paste that makes a spec
   silently assert the wrong element.

Verified by construction: dropping a bare `<button>` into a new component fails with the
path and line (`src/shared/ui/TempProbe.tsx:4 <button>`), and removing that file restores
green. That probe file was deleted; nothing in `src/` changed to make this suite pass.

Why static, given the rendered test already exists: a static parse sees the screens no
test mounts, needs no fixture or mock, runs in 20 ms in the node environment, and cannot
be defeated by a component that happens not to be in the tree that day. The rendered test
stays where it is — it verifies something different (that an id reaches the DOM after
mutation), and the two are complementary rather than redundant.

## 4. Two rows that were already false

The same audit pass over ADDENDUM-028 §6 found two entries that had quietly become
untrue, and both are corrected there in this change:

- §6.5 said "Phase 1's `FrameStudioControl.test.tsx` exists as `FrameStudioDock.test.tsx`;
  the file name is not". `src/features/frame-studio/components/FrameStudioControl.test.tsx`
  exists, with the panel's three required assertions (surface swap, detail presets,
  close/collapse) plus a pre-split golden. Item closed.
- ADDENDUM-001 §3's `data-testid` row moves from *Partial* to *Verified*, pointing here.

## 5. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **127 files, 1188 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines. The new file
  is a test, so it adds no uncovered statements.
- `npm run build` — succeeds.

**No browser in this sandbox; visual verification pending.** No rendering code changed;
the only product-code artefact of this addendum is a test.
