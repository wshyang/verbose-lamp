# ADDENDUM-040 — Prose that cannot go stale by construction

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §4, §7; ADDENDUM-034 (the documentation
gates); ADDENDUM-032 (the ratchet); ADDENDUM-039 (which made the numbers wrong again).
**Status:** Implemented — README and ARCHITECTURE no longer carry volatile counts.
**Audience:** anyone about to write "currently N" into a document.

## 1. The repeat offence

ADDENDUM-034 swept stale documentation and, as part of that sweep, wrote three numbers
into README.md and one into ARCHITECTURE.md:

- "**33 addenda**", "**122 files / 1144 tests**", "(currently **56**)" debt rows; and
- "(ADDENDUM-032, currently 56)" in the architecture note.

Three rounds of work later — ADDENDUM-036 through 039, all of which *reduced* the debt and
added tests — every one of those numbers was wrong. Nobody lied; the discipline simply
required a doc edit per commit and nothing measured it. That is the same failure mode the
addenda register had before it got a test (ADDENDUM-034 §2), one level out.

## 2. The decision: no volatile counts in prose

A document cannot verify a number it hard-codes. So the fix is not "remember to update the
number" but **not to state it**:

| Was | Now |
|---|---|
| "**33 addenda**" | "one row and one file per decision — and a test keeps the two in step, so the register is always the complete list" |
| "**122 files / 1144 tests**" | "the suite holds the coverage gate at 100 % over every logic module — `npm test` prints the current file and test count, and this document deliberately does not pin it" |
| "(currently **56**)" | "the current ceiling lives in `src/discipline.test.ts`, next to the assertion that enforces it" |

Every replacement points at something that **cannot disagree with itself**: the addenda
test, the test runner's own output, or the assertion itself. A reader who wants the number
can produce it in one command; a reader who trusts the document is no longer misled.

## 3. What stays a number

Deliberately not swept:

- **Contracted constants** — `STOP_FADE_MS = 300`, `CHAPTER_JUMP_OFFSET = 0.15`,
  `MAX_FRAME_STEP_S = 0.05`, the photo limits. These are code facts with one source, and
  the docs that mention them are explaining behaviour.
- **Historical numbers in addenda** — "371 lines became six functions", "debt 58 → 47".
  They describe a moment and are dated; rewriting them would falsify the record.
- **Section numbers** (`§3.4`, `ADDENDUM-022 §2.1`) — frozen by the base spec
  (BUILD_PROMPT §numbers) and checked by the addenda test's citation rule.

## 4. Why this is the right size of fix

The alternative was a test that parses README, extracts "N tests", and compares it against
the suite's own count. That is possible and was rejected on three grounds:

1. it couples documentation formatting to test output, so every legitimate README edit
   becomes a test change;
2. the number would still be *computed at a different moment* from when it is printed, so
   it would be right in CI and wrong a commit later;
3. the information has no reader who needs it in a prose document — the runner prints it,
   the badge would show it, the addenda record the trend.

## 5. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **126 files, 1184 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines.
- `npm run build` — succeeds.
- `grep -nE "[0-9]{3,} (files|tests)|currently \\*\\*[0-9]" README.md docs/ARCHITECTURE.md`
  — no matches, which is the check this addendum replaces a promise with.

**No browser in this sandbox; visual verification pending.** Documentation only; nothing
rendered changed.
