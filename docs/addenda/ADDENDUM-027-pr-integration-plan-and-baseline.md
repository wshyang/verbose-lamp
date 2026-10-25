# ADDENDUM-027 — Integrating PRs #2–#6: plan, decisions and baseline

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §2, §3, §7; CLAUDE.md §1, §2, §3, §6, §7, §10.
**Status:** Accepted. Phase 0 (baseline) implemented; Phases 1–8 and the test squash follow, each with its own addendum.
**Numbering note:** ADDENDUM-025/026 (GLSL files) landed first, so this programme's addenda run 027 (this), 028 seams, 029 R3F port, 030 parity, 031 lattice, 032 spectacle, 033 UI defects, 034 discipline, 035 browser gates, 036 test-merge record.

## 1. What was decided

Five agents implemented the same programme from `main` (`a9e396ab`) in parallel and opened PRs #2–#6
(`origin/arena/{2185d2b6,f5f5ef9a,f7bdd836,c6fc1589,e6313d13}-verbose-lamp`). All five touch the same files, so none
can merge as-is. Instead:

- A new branch, `integrate/best-of-pr2-6`, takes the **best implementation of each assessed item** (43 items, graded
  on modularity, code quality, error handling, architecture and design insight). The five PR branches are not modified.
  Files come over with `git checkout <ref> -- <path>` and are then edited; there are no merges or cherry-picks.
- **Tests are squashed by assertion, not by title.** Tests asserting the same thing on the same subject are merged
  into one; every unique assertion is kept, or ported to the winning implementation's API.
- The legacy `GatsbySceneManager` is deleted **only after** a measured parity check against a build of `main`.
- The full item tables and the task list live outside the repo (`~/.claude/plans/`); every phase's addendum records
  what it took from which PR and why.

## 2. Decisions made in Phase 0

| Decision | Choice | Why |
|---|---|---|
| `node_modules` | Untracked (10,066 files, about 2.5 M diff lines) | Only PR #3 did this; it made every other PR's diff unreadable. |
| Commit signing | Branch commits are **unsigned**: the repo-local `.git/config` sets `commit.gpgsign=false`, overriding `~/.gitconfig` (`true`). | The earlier session recorded that gpg could not reach `~/.gnupg` from the sandbox; this session did not re-test that. Earlier commits on `main` are signed. Re-sign before merging to `main` if the project requires it. |
| Tailwind scan scope | `@source not` for `tmp`, `reference`, `dist`, `docs`, `e2e` (PR #3) | Measured: before, editing `docs/ADDENDA.md` changed `dist/index.html`; after, two consecutive builds and a doc edit are byte-identical. |
| Canvas stub for jsdom | `vitest-canvas-mock` | A devDependency of PRs #2/#3/#5, and loaded once from `setupDom.ts` by #3 and #5, so no per-test code. PR #6's hand-rolled recorder (170 lines) needs `installCanvas2d()` in 16 test files. The two were not run against the same ported tests (none exist yet), so this is a design judgement, not a measurement. Revisit only where a ported test needs what the library lacks; the known case is `opaqueReadback` (`decoTypographyChamfer`). `main`'s node-side `spectacle/testing/recordingCanvas` is unchanged. |
| Host-portable goldens | `src/test/digest.ts` from PR #4 (quantise to 6 decimals before hashing) | `Math.sin/cos/pow` can differ in the last ulp between hosts; only PR #4 noticed. Existing `main` goldens are not yet converted; that happens as each golden is regenerated. |
| Coverage policy | Rule-based excludes with reasons + ratcheted global floors + named 100 % modules | See §3. Keeps CLAUDE.md §2 ("rendering thin, not unit-tested") intact. PRs #2/#3 chased a literal 100 % by deleting dead branches or adding 38 `v8 ignore` blocks; that is weaker than a proof. |
| Dependencies | Added R3F, zustand, six `@fontsource` families, test renderer, jsdom, Testing Library, coverage-v8, `@playwright/test`, `vitest-canvas-mock` | Not added: `@react-three/drei` and `@react-three/postprocessing` (the post-processing A/B was measured and rejected in PRs #3 and #5). `vite.config.ts` untouched; PR #6's host-specific `allowedHosts` edit is rejected. |
| GLSL | ADDENDUM-026's `.vert`/`.frag` + `?raw` files are the shader layout | R3F components import the existing barrel; no PR's TS shader strings are lifted. |

## 3. Coverage gate (what it measures and why)

`vitest.config.ts` excludes by rule: tests/snapshots, `src/test/setupDom.ts`, `.tsx` components, `render/**`, three
named imperative scene files (`GatsbySceneManager`, `decoCards`, `environment`), bootstrap and ambient types. Scene
files are excluded **by name, not folder**, so pure modules beside them (`responsiveLayout`, `shaders/`, and the
choreography seams to come) stay measured.

Measured when the gate was introduced, files loaded by no test counted: **statements 65.25 %, branches 64.33 %,
functions 58.52 %, lines 65.70 %**. Floors are set at those figures (65/64/58/65) and may only rise. Named 100 %
thresholds: `src/test/digest.ts` and `glslDeclarations.ts`; each phase adds the modules it lands.
Largest uncovered logic files today: `decoAlphabet.ts` (212 statements), `useFrameStudio.ts` (92), `cinemaAudio.ts`
(76), `useGildedPortrait.ts` (73), `usePhotoSession.ts` (68). The gate was verified to fail (rc=1) when a floor is
raised above the measurement, and to pass at the real floors.

## 4. Phase 0 code reads (items marked † in the plan)

- **#29 Dialog Escape/focus:** take PR #4's `useEscapeKey` (window-level) + `useDialogFocus`. PR #5's module-level
  closer stack closes only the topmost dialog, which #4's per-dialog listener does not (two open dialogs would both
  close). No call site stacks dialogs today (6 modal usages), so add #5's semantics only after a stacking test exists.
- **#27 lattice export:** PR #6's `svgExport.ts` is sound (pure `toSafeFileStem`, thin DOM wrappers, `finally`
  revokes the object URL). On lift, remove QR-specific wording from the shared helper (error text says "the code";
  stem fallback is `golden-qr`) and handle a null `toBlob` instead of silently downloading nothing.
- **#33 drum colour stops:** confirmed in PR #3 (`Math.round` on nine channels). `main` has a drum golden, so its
  snapshot changes; update it and say why in the Phase 6 addendum.
- **#20/#21 residue:** deferred to Phase 5, where those files are lifted and read.

## 5. Practical impact / what a future reader must know

- This branch's commits are not on `main`; it is a rewrite-free branch off `a9e396ab`.
- Until Phase 3, `GatsbySceneManager` stays and its tests keep passing.
- Visual verification stays honest: Playwright Chromium here is headless on SwiftShader (software GL); it proves
  repeatability, not real-GPU aesthetics. Human visual passes remain pending for the glyph icons and hero credit.
- Binary likeness baselines from PRs #4/#5/#6 are intentionally discarded and re-recorded once on this branch.

## 6. Validation actually performed (Phase 0)

- `npx tsc --noEmit`, `npm test` (444 tests, 63 files) and `npm run build` pass after every task;
  `npm run test:coverage` passes at the floors above.
- Tailwind: consecutive builds byte-identical, and a probe edit to `docs/ADDENDA.md` no longer changes
  `dist/index.html`. (Before the change it did.)
- Not performed in this phase: any browser run, parity, or visual comparison. Those start at Phase 3.
