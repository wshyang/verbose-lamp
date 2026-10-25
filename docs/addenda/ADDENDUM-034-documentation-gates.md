# ADDENDUM-034 — Documents that cannot lie, and the sweep that proved they were

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §4 (the addenda discipline), §7
(validation honesty); README.md; docs/ARCHITECTURE.md; ADDENDUM-030 (fonts);
ADDENDUM-032 (the discipline ratchet).
**Status:** Implemented — the register is now guarded by a test, and the two
user-facing documents have been brought back in line with the code.
**Audience:** anyone reading README to learn what the project does, and anyone whose
change adds an addendum.

## 1. The drift that started this

By ADDENDUM-033 the project had 33 addenda, 122 test files, two renderers behind a URL
parameter, self-hosted fonts and a 100 % coverage gate. README.md still said:

- fonts come "from Google Fonts (`index.html`)" — removed in ADDENDUM-030;
- "Three.js and DOM rendering code ... is not unit-tested" — there are now jsdom suites
  and `@react-three/test-renderer` suites in `scene3d/`;
- "Playwright e2e is deferred" — 42 specs exist in `e2e/`, unrun but compiled and
  cross-checked by `e2eContract.test.ts`;
- nothing about `?freezeAt`, `?renderer=classic`, the sparkler overlay, the coverage
  gate, or the discipline ratchet;
- a features list missing six features (`deco-lattice`, `spectacle`,
  `spectacle-preview`, `lucky-draw`, `gilded-ui`, `event-night`).

None of that was a lie when written. All of it was stale, and stale is worse than
absent: a reader trusts a specific claim more than a vague one. `docs/ARCHITECTURE.md`
had the same problem in its module map — no `scene3d/`, no `src/test/`, and a closing
paragraph that named `GatsbySceneManager` as *the* renderer.

## 2. The decision: guard the register, sweep the prose

The addenda discipline is the project's single most important convention — CLAUDE.md §4
requires a file and a table row for every decision, *in the same change*. It had exactly
the weakness ADDENDUM-032 found in the coding limits: nothing enforced it. Two symptoms
had already cost time in this session:

1. `ADDENDUM-031-walk-halo-defect.md` sat unregistered for a round while source comments
   cited "ADDENDUM-031" for a *different* subject (a ratchet that became 032).
2. Nothing would have noticed had the file been dropped entirely.

So `src/addenda.test.ts` now reads `docs/` off disk and asserts:

| Assertion | Catches |
|---|---|
| register ⟷ files, both directions | an unregistered file, or a row whose file is missing |
| numbering is `1..N`, no gaps, no duplicates | two records claiming one number |
| every file opens with `# ADDENDUM-0NN` | copy-paste numbering, which is how the 031/032 clash happened |
| `**Date:** YYYY-MM-DD` and a body over 400 characters | placeholder rows |
| no `ADDENDUM-NNN` citation anywhere in `src/`, `docs/`, `e2e/` points at a missing file | the clash above, caught at the citation site |

It bit on first run — on itself. The file's own docblock cites ADDENDUM-034 before that
addendum existed, and the citation test failed with
`src/addenda.test.ts → ADDENDUM-034`. That is the right order of operations: write the
guard, watch it fail, then satisfy it.

Deliberately **not** asserted: the wording of a decision, its status column, or that the
row's "relates to" section numbers exist. Those are judgement calls; a test that froze
them would be edited to pass rather than obeyed.

## 3. What the sweep changed

**README.md**

- Test table now carries `npx vitest run --coverage` and `npx playwright test`, and the
  "before calling a change done" line names all four commands plus the one gate a
  browserless sandbox cannot close.
- Fonts section rewritten: self-hosted latin-subset WOFF2 with OFL texts, mounting gated
  on `waitForFonts()`, inlined as data URLs in the single-file build.
- A new "two URL parameters" subsection documents `?freezeAt=<seconds>` (with
  `data-frame-ready`) and `?renderer=classic`, and the sparkler button joins the controls
  list.
- Testing section restated with the real numbers (**122 files / 1144 tests**, 100 %
  coverage on the logic surface), the jsdom opt-in convention, the three test-only
  guards, and the honest status of the e2e suite: written, listed (42 tests, 2 files),
  never executed, no baselines.
- Conventions section now says the 50-line limit is *enforced* by
  `src/discipline.test.ts`, with the current debt count (**56**).

**docs/ARCHITECTURE.md**

- Module map gains `premiere/model`, `premiere/scene` and `premiere/scene3d`, and
  `src/test/` is described where ownership is described.
- `features/premiere` now documents the two-renderer seam: R3F is the default;
  `?renderer=classic` mounts `GatsbySceneManager`, which is scheduled for deletion;
  `PremiereStage` is the GPU-free seam the headless suites mount.
- A new closing section, **Keeping It Honest**, describes the three architectural gates
  (coverage, discipline, e2e contract) and the rule that a code-motion refactor arrives
  with a golden captured *before* the move.

Both files now carry numbers that will age. That is accepted on purpose: the counts are
labelled as a snapshot and the discipline test keeps the mechanism (not the number) true.
A future round can replace "56" with "0" without touching a single assertion.

## 4. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **123 files, 1149 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines.
- `npm run build` — succeeds.
- `src/addenda.test.ts` — 5 tests, one of which failed against its own docblock before
  ADDENDUM-034 existed, and now passes.

**No browser in this sandbox; visual verification pending.** This round touches only
Markdown and one new test file, so no pixel is at stake — but the pending screenshot pass
is still the gate on the whole programme, and the docs above say so rather than implying
the work is finished.
