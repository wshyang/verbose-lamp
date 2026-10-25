# ADDENDUM-036 — The test merge: what was kept, dropped and ported from the five PRs (Phase T)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §2, §7; CLAUDE.md §2, §3, §7; ADDENDUM-027 §3 (coverage policy), ADDENDUM-034 (the ratchet), ADDENDUM-035 (browser gates).
**Status:** Implemented and run. The numbers below were measured with a script over the compiler's parse of every test file, not estimated.

## 1. What was decided

1. **Dedupe by assertion, not by title.** A script (TypeScript compiler API, not committed: it was scaffolding) read every `it` in `main`, this branch and the five PRs and recorded the normalised text of each `expect(...)` chain. A PR case was dropped only when every one of its expectations already appears somewhere on this branch. Everything else was a candidate to keep.
2. **Keep the rest, in the PR's own module scope.** Each PR file that carried a unique assertion lives beside its subject as `<subject>.<pN>.test.ts[x]` (N is the PR number), with its imports, mocks and fixtures intact and a one-line header naming the PR. They were first concatenated into the subject's file; that broke 41 files (a `vi.mock` hoisted in one part, call counts and DOM state left by another) and 45 more had name clashes, so concatenation was abandoned. Separate files cost some duplicated setup and keep every test exactly as its author ran it.
3. **Goldens are not merged.** A snapshot-bearing PR case is dropped from the tree and compared in §4 instead. Two PRs' snapshots of the same subject share numbered slots and would overwrite each other, and a committed golden must have one owner.
4. **The coverage gate is now the full logic surface at 100 %**, not a floor (§5).

## 2. The counts

| | Files | `it` cases |
|---|---|---|
| `main` | 59 | 271 |
| This branch before the phase | 165 | 1,429 |
| PR #2 / #3 / #4 / #5 / #6 as submitted | 161 / 157 / 131 / 102 / 180 | 691 / 998 / 931 / 539 / 1,317 |
| **This branch now** | **585** | **3,483** (vitest runs 4,320, counting each `it.each` row) |

Of the 585 files, 420 are new this phase: 310 are `<subject>.<pN>.test.*` and 110 are new subjects with their own plain name (a PR tested a module nobody here had tested).

Of the 3,367 PR cases considered after the first mechanical pass:

| Verdict | Cases | Meaning |
|---|---|---|
| Kept | 2,071 | A passing case with at least one expectation this branch did not have |
| Already covered | 905 | Every expectation present elsewhere here: the duplicates the brief asked to squash |
| Failing against this API | 322 | Written for another PR's signature (see below) |
| Duplicate across PRs | 67 | Same unique assertion set in two PRs; the earlier PR in the order #3, #4, #6, #5, #2 wins |
| No assertion | 2 | Dropped |

By PR, kept / covered / failing / duplicate: #2 281 / 79 / 98 / 10; #3 564 / 185 / 67 / 15; #4 428 / 166 / 51 / 14; #5 160 / 167 / 30 / 6; #6 638 / 308 / 76 / 22.

**The 322 failing cases** were not discarded blindly. Many fell into API renames that map one to one and were ported (`role` for `variant` and `isFinale`; `greenLight(t, heroZ)`; `clipPolylineOutsideRect(points, rect)`; the effect id `sparkler`; `origin` now required; `dispose` on the scene port; the new reroll and border-pattern props). The rest assert designs this branch deliberately did not take: P2's `variant` card API, P4's `isFinale` flag, `usePremiereStore` and `PremiereStage`, the `celebration-overlay` and `party-sparklers` features, and the renderer-select pieces. Their subjects do not exist here. I did not count those separately.

**Nine files** whose component props differ were ported by hand after the mechanical pass. Seven were kept: `PremiereHeader.p2`, `usePremiereHooks.p4` (three of its eighteen cases were already covered and dropped), `PremiereScene.p6`, `TitleCard.p6`, and `FrameStudioControl.p2`, `.p3`, `.p4`. Two were dropped as redundant: `DecoWall.p3` and `PremiereCanvas.p3`, because this branch already asserts disposal and coarse-pointer detection more thoroughly and their premises (a `store` prop, a `hasCoarsePointer` prop) no longer exist.

## 3. What the unique cases are, by area

Not listed one by one. The largest groups are choreography and the store (cases from all five PRs on camera depth, card phases, orbit focus and the green light), the avatar studio and its hooks, the spectacle engine (scheduler, layers, stage, provider), face detection and background removal edge cases, the enamel backdrop, the gilded portrait pipeline and its modal, the lucky draw hooks, and the lattice clipping and walk. The files are the record: each carries its PR in its header.

## 4. Snapshot cross-validation

454 snapshot entries from the five PRs were compared by key and value with this branch's committed ones. 271 are identical. The 149 that differ and 34 with no counterpart fall into these groups:

| Group | Finding |
|---|---|
| `drumRenderer.golden` | PR #3's four hashes equal this branch's (the ADDENDUM-033 whole-number colour fix). #2, #4, #5 and #6 recorded the pre-fix hashes |
| `composition.golden` (lattice) | PR #6's ten entries are identical; #2, #3, #4 and #5 differ in 3, 3, 7 and 4 entries, the ones that depend on frame-bracket seeding that only #6 changed (ADDENDUM-031 §4) |
| `effects.golden` | The "orbs … full motion" entries differ in #3, #4 and #6: the transition now draws sparklers (ADDENDUM-032). The others match |
| `planning.golden` | The `planOrbTransition` timelines differ for the same reason. The shell recipes and `planShow` hashes differ from `main`'s in four of the five PRs, yet this branch reproduces `main`'s committed values on this host, so those PR values come from changes in the PRs, not from host noise. I did not trace each PR's change |
| `choreography`, `decoAlphabet` | One entry each with no counterpart here (a differently named export) |

I explained the drum, lattice and orb differences from the earlier addenda. The shell-recipe differences are **not explained beyond "the PRs changed the planner"**; I checked that this branch matches `main`, not what each PR did. No `.snap` file in the tree was written by this phase.

## 5. Coverage

Measured with every non-excluded file counted: **100 % statements, branches, functions and lines.** It was 82.6 / 77.0 / 78.4 / 83.8 before the phase. `vitest.config.ts` now sets the global threshold to 100; removing one covering test makes `npm run test:coverage` exit 1 with the percentage, and restoring it exits 0 (both observed).

Reaching it needed no `v8 ignore` and no deleted test. Eight gaps remained after the merge. Five were guards a test could reach (a missing 2D context, a non-`Error` rejection, a lattice rail kind, a stub's default, the recorder's empty log) and got tests. One `?? false` and one `?? []` default were dead because the producer always sets the field, and were removed. The placeholder resolver in `createEntry` was overwritten synchronously and became a definite assignment. And `miterAt`'s "no neighbour" case, which `offsetPolylineOutward`'s early return rules out, now throws instead of inventing a normal (and is tested to).

## 6. Things a future reader must know

- **A `.pN.` test is not a second opinion on the same file.** It has its own mocks and fixtures. If you change a subject, run both. If one starts to hurt, port its unique cases into the subject's file by hand and delete it.
- **Three tests carry a 30 s ceiling** (`testidCoverage.p4`, and two in `fireworksEffect.p6`). They are 1 to 5 s of real work and sat at the 5 s default under a parallel full run, which produced intermittent failures before the ceiling. Six full runs afterwards were clean.
- **Tests must not touch the network.** One kept test used the real CDN loader on its default path and intermittently outlived the run; it now injects a loader that rejects the way an unreachable CDN does. A few tests still call the real default loader and expect a rejection, which Node returns immediately.
- **Run staged tests with `CI=1`.** Vitest otherwise writes new snapshot entries and rewrites existing ones silently; it did so to four committed goldens during this phase. The changes were reverted and none was committed.

## 7. Validation actually performed

- `npx tsc --noEmit` clean; `CI=1 npm run test:coverage` passes at 100 % (585 files, 4,320 tests); six consecutive full runs of the suite passed; `npm run build` passes.
- The 100 % gate measures execution, not assertion strength. The cases ported here passed against this branch's code, which is weaker evidence than a failing mutant; they were not mutation-tested individually.
- Not performed: any review of the 2,071 kept cases for quality beyond "passes and asserts something new". Some will be low value, for example repeated edge-of-range cases, and the ratchet will not tell you.
