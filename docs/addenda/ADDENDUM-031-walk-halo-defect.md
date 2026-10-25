# ADDENDUM-031 — Defect record: the Deco Lattice walk halo blocked every walk

**Date:** 2026-10-25 (recorded retroactively; the fix landed in `debcc64`) ·
**Relates to:** CLAUDE.md §2, §7, §11; ADDENDUM-021 §3 (walks); ADDENDUM-025 §3.4
(coverage contract); ADDENDUM-027 §4.
**Status:** Fixed and verified by tests. **Visual verification of the Deco Lattice is
still pending** — the bug's whole nature is that there was less geometry than there
should have been, so the fix changes what the frame looks like.
**Audience:** anyone trusting a green suite, and the person who will eventually
compare the lattice against the film stills.

> Recorded as its own addendum on purpose. It was a **defect of omission** — a
> feature that silently produced nothing — not a coverage chore, and folding it into
> a "coverage closure" record would hide exactly the lesson worth keeping.

## 1. How it was found

The ADDENDUM-027 coverage contract demanded 100 % on logic modules. `walk.ts` had six
unexecuted lines (60–65: the step loop's body). Coverage gaps had been treated as
"tests we have not written yet". This one was not: the lines could not execute,
because `traceWalks()` always returned an empty list.

## 2. The defect

`traceWalks()` grew the lattice's random walks with three rules over one set of
occupied cell keys:

1. a step may not land on a cell another walk owns;
2. a walk starts only if it is clear of the last walk;
3. (implicitly) a walk may not walk through its own trail.

All three were implemented by writing into **the same** `occupied` set — and rule 2's
clearance was a 3×3 halo around every reserved point, written *for the point a walk
had just stepped onto*.

The consequence is a one-line proof: after reserving the first cell of a walk, that
cell's own halo includes the cell itself. The next candidate step is therefore
adjacent to the halo, and every neighbour of a haloed cell is inside the halo. **No
first step could ever be clear, so no walk ever left length one — and a walk of
length one is discarded.** The feature had never drawn anything, in any build,
despite `motifs.ts`, `symmetry.ts` and the composition tests all being green.

## 3. The fix

Two sets, because the two rules are different questions:

| Set | Contents | Consulted by |
|---|---|---|
| `taken` | the cells a walk actually owns | the *step* collision test |
| `spaced` | the 3×3 halo around owned cells | the *walk start* clearance test |

`reserve(taken, spaced, p, cell)` writes both; `isClear(p, options, blocked)` checks
taken + trail. A walk may now step next to its own trail (it should), while a new walk
still starts clear of the previous one (it must).

```
- function reserve(occupied, p, cell)  { halo → occupied }
- isFree(p, o, occupied)               { !occupied.has(cell) }
+ function reserve(taken, spaced, p, cell) { taken.add(cell); halo → spaced }
+ isClear(p, o, blocked)                   { !blocked.has(cell) }
```

## 4. What moved, and why that is not a regression

`composition.golden.test.ts.snap` changed: the walk motifs now exist. On the default
medallion the spec count goes from **123 to 243**. Nothing else moved — no other
feature's goldens changed, because no other feature reads the walks.

A golden that moves because a feature started working is the *only* good reason to
regenerate a golden, and it must be recorded. This is that record. The alternative —
freezing the empty snapshot — would have preserved a bug as the specification.

## 5. Tests that now hold the line

`src/features/deco-lattice/model/walk.test.ts`:

- determinism per seed, difference across seeds;
- every point stays inside the wedge annulus and on the cell grid;
- walks are at least two cells long (the invariant the bug broke) and do not revisit
  a cell;
- straight runs and both turn directions are reachable across seeds;
- the seeded turn weighting (straight 0.55 / ±45° 0.30 / ±90° 0.15) produces both.

The suite would fail on the old code at the first assertion, which is the point: the
test is written against the behaviour, not the implementation.

## 6. The lesson worth keeping

A green suite said nothing about this feature, because nothing asserted that it *did*
anything. Coverage found the hole; the hole was a missing feature, not a missing
test. Two practices follow, and both are now in place:

1. **Assert non-emptiness.** Every generator test in this tree now asserts that it
   produces something before asserting properties of that something. `expect(walks.length).toBeGreaterThan(0)`
   is not padding; it is the assertion that would have caught this on day one.
2. **Treat unreachable lines as a smell, not a chore.** The coverage contract's real
   value was not the percentage. It was that a line nobody could reach was a question
   nobody had asked.

## 7. Open

The lattice now draws roughly twice as much as before, and that has **never been seen
in a browser**. The pending visual comparison (specs 123 → 243) is the user's, and it
is the one check that can still say this fix is wrong.
