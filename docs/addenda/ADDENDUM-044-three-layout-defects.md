# ADDENDUM-044 — Three layout defects that only a browser could find

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-043 (the run that found them);
ADDENDUM-012 (topmost studio); ADDENDUM-027 §3 (the console panel); CLAUDE.md §3, §5.
**Status:** Implemented — one portal, one breakpoint rule, one repositioned button; three
unit tests added; both Playwright viewports green.
**Audience:** anyone who reads `className="fixed inset-0 …"` and assumes it means the
viewport.

## 1. The console panel was 2 px tall

`SpectaclePreviewPanel` is a docked, non-modal console: `fixed bottom-24 left-3 top-16
z-80 overflow-y-auto`. Measured in the browser: **height 2 px**, `scrollHeight` 1290.

The panel is rendered by `PremiereEffectsDock`, which lives inside `<header>`. The header
carries `translate-y-0` / `-translate-y-3` for its hide transition, and **a transform makes
an element the containing block for `position: fixed` descendants** — even
`translate-y-0`. So `top-16 … bottom-24` resolved against the header's own 162 px box, not
the viewport. Everything inside the panel was clipped except two pixels of border, and the
Frame Studio (`z-70`, a sibling of the header) covered what little was left.

Two things were wrong and only one of them is a keyword:

1. **Fixed is not viewport-relative under a transformed ancestor.** The panel is now a
   `createPortal(…, document.body)`, the same escape `Dialog` already uses. A docked panel
   is viewport furniture; it should not inherit the HUD's motion transform either.
2. **Right-aligned was the wrong corner.** The Frame Studio owns the right edge
   (`right-3 … w-[min(320px,…)]`). Two docks in one corner is a collision, not a stack:
   the console now docks on the **left**, with `max-sm:right-3 max-sm:w-auto` so a phone
   still gets the full width.

## 2. The studio started open on a phone, and its reopen button sat on the launchers

At 390×844 the header wraps to three rows — **220 px tall** — and the collapsed studio's
reopen chip (`absolute right-6 top-28`, i.e. y = 112) landed on top of the QR launcher
(x 200–266, y 111) and the sparkler button. Playwright's report was precise:
`<svg class="lucide-layers"> from <div class="relative z-[70]"> subtree intercepts pointer
events`.

And the panel itself started `useState(true)`, so on a phone the first thing the user saw
was a 320 px studio column on top of the film, with the header and timeline underneath it.
Every launch button was present, visible and unclickable.

Fixes, both small and both in the logic layer:

- `model/panelStart.ts`: `panelStartsOpen(width) = width >= 1024`, tested at the boundary.
  `usePanelVisibility` seeds from `window.innerWidth`. On a phone the panel starts
  collapsed and is one tap (`frame-studio__reveal`, or `F`) away; on a desktop nothing
  changes.
- the reveal chip moves to `right-3 top-60` below `sm` (clear of a wrapped header) and
  keeps `sm:right-9 sm:top-28` — where it is a stage-edge affordance again once the header
  fits on one row.

## 3. Why these three had no unit test

Each is a *composition* fact, not a rule: containing blocks, z-order, and which of two
overlapping elements receives a pointer. jsdom has no layout engine, so a DOM test can
assert the markup and not one of these properties. The static `data-testid` suite
(ADDENDUM-042) passes on all three, correctly — every control had an id; three of them were
just unreachable.

The honest summary is that the project had 1188 green tests and three defects that a
single real page load exposed in under a minute. That is not an argument against the tests;
it is the argument for the gate.

## 4. Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **131 files, 1206 tests**, green: three new `panelStartsOpen` tests,
  four for the extracted `useEscapeKey`, seven for `useDialogFocus`. The existing
  `FrameStudioControl`, `useFrameStudio` and `spectacle-preview` suites pass unchanged,
  which is the check that the portal did not change the rendered tree.
- Recorded debt **47 → 46**: `FrameStudioDock` went 53 → 44 lines with the chip extracted
  as `RevealButton`, and `Dialog` went 84 → 72 with focus management moved into
  `shared/hooks/useDialogFocus.ts` (18 lines). Extracting rather than raising the two
  ceilings is the point of the ratchet (ADDENDUM-032).
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines.
- `npm run build` — succeeds.
- Playwright, **desktop 1440×900**: `flows` 8/8. **Mobile 390×844**: `flows` 8/8 — and the
  mobile file went from 6.3 min with five failures to **2.2 min with none**, because the
  studio is no longer sitting on the toolbars.
- Likeness: 12 desktop + 12 mobile baselines, captured after these fixes.

**No browser on the user's machine was used; these captures come from SwiftShader in this
sandbox, so "looks right on a phone" means "looks right at 390×844 in Chromium", which is
the best this environment can honestly claim.**
