# ADDENDUM-034 — The discipline ratchet, the splits it forced, and the standing-rule updates (Phase 7)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §2, §9; CLAUDE.md §1, §2, §3, §6, §7; ADDENDUM-001 §4 (the debt this retires), ADDENDUM-027 §3 (coverage policy).
**Status:** Implemented. Everything below is pinned by tests; **nothing in it has been rendered in a browser**, and the splits of UI components were checked by comparing serialised DOM in jsdom, not pixels.

## 1. What was decided

1. **The limits in CLAUDE.md §6 are enforced by a test, as a ratchet** (`src/discipline.test.ts`, PR #4's idea, rebuilt on the TypeScript parser so every function is measured the same way). The test fails when a function exceeds 50 lines, 3 parameters or nesting 3, or a file exceeds 800 lines, unless the function has a row in `src/test/disciplineBaseline.ts`. A row is a ceiling, not an allowance: it can be lowered or deleted, never raised, and a row whose function no longer offends fails the test, so the table cannot rot. A separate assertion caps the number of rows.
2. **Offenders this branch introduced were fixed, not recorded.** Every time a split produced a new function over the limits, it was split again. The table holds only debt that came with the original import.
3. **Splits were done under a before-and-after rule.** A behaviour record was taken from the unmodified code and compared after the split: a 390-case archetype grid, a 204-case rail-extrusion grid, a 216-case typography grid, a 77-state script over the Frame Studio hook, the serialised DOM of the Frame Studio panel (13 prop variants) and of both modals (13 frames), and characterisation tests for hooks that had none (photo session 24, QR state 15, premiere controller 20). Each was identical after the split.
4. **CLAUDE.md §2, §3 and §6 are updated** (section 4 below) because they described a state that no longer exists: Playwright e2e deferred, "rendering code is not unit-tested", coverage unspecified. They now state the policy actually in force.
5. **README and `docs/ARCHITECTURE.md` are refreshed without counts.** Counts of tests, files and rows go stale in the commit after they are written; the numbers live in the tests that enforce them.

## 2. Why

- The limits were written down in ADDENDUM-001 and then not kept: the debt table there named four files; when the ratchet landed the tree had 62 offending functions. A rule nobody checks is advice.
- A ratchet is the cheapest enforcement that does not demand a big-bang cleanup. It makes the number only go down and puts each cleanup in front of whoever touches the code next.
- Refactors without a behaviour record are guesses. The records caught real slips during this phase: a changed `createPattern` argument in a canvas helper, class-token order in the corner marks and form fields, a wrapper `<div>` added around one form field by a split, and a `feature-hook` debt reason that outlived its last row.

## 3. What was split, and what is left

| Area | Before | After |
|---|---|---|
| Carved-type builder (`decoTypography`) | one 371-line function | layout, mask, face maps, reveal material |
| Frame grammar (`archetypes`) | one very long builder | one module per act, a dispatch and the fractal pass |
| Rail extrusion (`railGeometry`) | one long builder | named steps, named constants; the redundant miter clamp removed (the scale cap binds first, now shown by a sweep) |
| Frame Studio hook (211 lines) and panel (291) | one of each | visibility, sequence and border hooks plus pure formula, actions and view modules; header, switch, two panels, six sections |
| Title modal (182) and research dossier (161) | one each | draft hook, form, field, preset bar; header, figures, section card; shared `CornerBrackets` |
| Photo session, QR generator, premiere controller and runtime | one hook each | pure session and view modules, loader, export, display and settings hooks, callbacks and lifecycle |

**Debt now recorded: 49 functions** (62 when the ratchet landed). By reason: 10 components, 30 geometry primitives, 4 render rigs, 5 linear orchestrators. The `feature-hook` reason has no rows left and was removed. The largest left are `createDecoWallpaperTextures` (176 lines) and `createGatsbyCardRig` (193), three.js rigs from the original import whose behaviour is pinned only by goldens and headless scene tests. ADDENDUM-001's four-row table is superseded by `src/test/disciplineBaseline.ts`, which is the live record.

## 4. Changes to CLAUDE.md

- **§2** says: rendering code is kept thin and is covered by jsdom and headless-scene tests for its *wiring* (DOM written, calls made), never its pixels; logic still lives in the pure layer. The coverage gate measures the logic surface, with excludes stated by rule in `vitest.config.ts` and 100 % thresholds on named modules (ADDENDUM-027 §3). A literal 100 % is not required; the gate is a ratchet.
- **§2** says: Playwright e2e and the likeness gate are a planned phase of this integration (ADDENDUM-035 when it lands); until then the deferral in ADDENDUM-001 stands. Video-on is not the default; traces are kept on failure.
- **§3** says: `npm test` is `vitest run`; `npm run test:coverage` is the gated run; DOM suites opt in per file with `// @vitest-environment jsdom`; `vitest.config.ts` stays separate from `vite.config.ts`.
- **§6** points at `src/discipline.test.ts` as the enforcement, and says a split that introduces a new offender is not finished.

These follow PR #3's wording where it was accurate and correct it where it was not: PR #3 claimed a 100 % gate on every metric, which this branch does not have and ADDENDUM-027 chose not to chase. The e2e statement is deliberately conditional: the browser gates are Phase 8 and are not written yet, so CLAUDE.md must not claim them.

## 5. Practical impact / what a future reader must know

- If `discipline.test.ts` fails with an unrecorded function, **split it**. Recording it is the last resort and needs a sentence here saying why.
- When a row is paid off, delete it and lower the cap in the same commit (the cap is asserted).
- The behaviour records used for the splits were scratch files, deliberately **not committed**: they were generated from code that no longer exists. What remains is the tests written beside them.
- A split that wraps or reorders class names changes the DOM string without changing the page. The comparisons were byte-exact, so these were chased to zero; do not treat class order as free in a future split without the same check.

## 6. Validation actually performed

- `npx tsc --noEmit`, `npm test`, `npm run test:coverage` (global floors 82 / 77 / 78 / 84 hold) and `npm run build` pass.
- Hand mutation of the new pure modules and hooks: every mutation was caught except a handful of equivalents, each argued in its commit (a genome clamp that cannot bite for gallery genomes, preset aliasing made harmless by copy-on-edit, and a list key that only affects a React warning).
- **Not performed:** any browser run. The DOM comparisons prove the markup is byte-identical, not that it looks right.
