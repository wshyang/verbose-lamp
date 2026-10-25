# ADDENDUM-028 — Testability Phase 1: DOM component tests on the existing renderer

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 §5 (Phase 1), ADDENDUM-027 (Phase 0);
CLAUDE.md §2, §3, §5. **Status:** Implemented.

## 1. What was decided

The DOM layer — previously the largest untested surface — now has component tests beside
each component, under Vitest's per-file `// @vitest-environment jsdom` opt-in. The node
environment stays the default so the 489 pure tests are untouched.

| Piece | Where |
|---|---|
| Test dependencies | `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `vitest-canvas-mock` |
| Config | `vitest.config.ts`: `include: src/**/*.test.{ts,tsx}`, `setupFiles: src/test/setupDom.ts` |
| Setup | `src/test/setupDom.ts` — no-op outside jsdom; RTL `cleanup()` after each test; canvas stub for texture builders |
| Fixtures | `src/test/fakeFrameStudio.ts` — a `FrameStudioController` over the real catalogues with spy handlers |
| Suites | `PremiereTimeline`, `PremiereHeader`, `FrameStudioControl`, `CustomTitleModal`, `CelebrationLauncher` (23 tests) |
| Rule-as-test | `src/app/testid-coverage.test.tsx` renders the composed premiere and fails if any interactive element lacks a `data-testid` |

## 2. Why / deviations

- **Plain `expect`, no jest-dom**, per the plan: fewer moving parts, assertions stay
  explicit (`getAttribute('aria-pressed')`, class containment, handler calls).
- Assertions use domain fixtures (`SEQUENCE_CHAPTERS`, `DEFAULT_HERO_TITLE`,
  `FRAME_SOURCES`, `DESIGN_GALLERY`) — never `item-1` stand-ins (CLAUDE.md §3).
- The header suite stubs only the celebration launcher's stage dependency; the overlays
  suite stubs only `useSpectacle`. Everything else renders for real, so these are genuine
  wiring tests (Escape-to-close goes through the shared `Dialog` focus trap, the countdown
  really chains its finale through the hook).
- `testid-coverage` found **no offenders** in the composed premiere; it now guards the
  rule permanently. The spectacle provider and premiere controller are mocked there because
  the real ones own WebGL/canvas lifecycles jsdom cannot run — the rendered DOM tree is
  otherwise the production composition.

## 3. Relation to the base spec

BUILD_PROMPT §7 surfaces only; no production code changed in this phase. This completes the
second of ADDENDUM-022's three testability layers (pure ✓, DOM ✓, screenshot gate scaffolded
in ADDENDUM-027 awaiting user baselines).

## 4. Practical impact / future reader

- New interactive elements without a `data-testid` will fail CI at `testid-coverage` —
  add the id, do not weaken the test.
- Component tests must not reach for WebGL: mock at the feature barrel (`@/features/spectacle`,
  `@/features/premiere`) as these suites do.
- `src/test/` is test infrastructure only; production code must never import it.

## 5. Validation actually performed

- `npx vitest run` on the six new suites: 23 passed.
- Full gate: `npx tsc --noEmit` ✓, `npm test` ✓ (72 files, 512 tests).

**Caveat:** jsdom is not a browser. These tests prove DOM wiring and accessible state, not
pixels — that remains the Playwright gate's job (ADDENDUM-027 §5).
