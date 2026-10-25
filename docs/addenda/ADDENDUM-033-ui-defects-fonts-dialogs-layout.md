# ADDENDUM-033 — UI defects: fonts, dialogs, layout, icons, hero card, drum colours (Phase 6)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §5, §7; CLAUDE.md §2, §5, §7. Integrates the browser-found UI fixes from PRs #3, #4, #5 and #6 as set out in ADDENDUM-027.
**Status:** Implemented and unit-tested. **None of it has been seen in a browser by me.** PRs #4 and #6 found most of these defects by running one; here each is pinned by a test, but the pictures, the phone layout and the focus timing are unverified. Visual verification pending.

## 1. What was done

| Item | Where | Base | Notes |
|---|---|---|---|
| Self-hosted fonts | `app/fonts.ts`, `shared/lib/fonts.ts`, `main.tsx`, `index.html` | PR #5's `@fontsource` packaging, PR #4's `waitForFonts` gate | Google links removed; 15 faces inlined; bundle 1.7 to 2.4 MB |
| Dialog Escape and focus | `shared/hooks/useEscapeKey.ts`, `useDialogFocus.ts`, `shared/ui/Dialog.tsx` | PR #4 | PR #5's topmost-only rule built in, test first; PR #3's 15-case Dialog suite |
| Layout | `SpectaclePreviewPanel`, `FrameStudioDock`, `useFrameStudio`, `model/panelStart.ts` | PR #4 | modal z-index to 80 from PR #3 |
| Nav icons | `gilded-ui/model/glyphIcons.ts`, `GildedNavBar` | PR #6 | path-extents check replaces P6's partial one |
| Hero card | `scene/decoCards.ts` | PR #6 | credit and keystone positions pinned |
| Drum colours | `lucky-draw/render/drumRenderer.ts` | PR #3 | helper instead of nine inline roundings |

## 2. Defects, and how each was found

| Defect | Evidence |
|---|---|
| Canvas text (drum, countdown, name reveal) baked Georgia whenever a CDN face had not arrived; offline and blocked visits lost the typography | Reading how `ctx.font` is used. `main.test.tsx` fails if the app mounts before `document.fonts.ready` |
| An Escape pressed before the dialog's focus frame, or while focus sat on the trigger, reached nothing | PR #4's browser run. Reproduced here first: one test failed against the current `Dialog` |
| Two dialogs open at once would both close on one Escape | Not reachable today (nothing stacks dialogs). Built in and tested because a confirm over an editor is the obvious next use; two tests failed against PR #4's version |
| The console was rendered inside the transformed header, so `position: fixed` was relative to the header | PR #4's browser run; a test now asserts it is a child of the body |
| The Frame Studio opened over a phone-width screen; its reopen chip landed on the QR and sparkler launchers | PR #4's mobile run |
| Research and title-editor modals at z-50 sat behind the studio at z-70 | Reading the classes; `src/test/stacking.test.ts` now fails if any modal is not above every docked panel |
| Six gilded nav icons were colour-emoji `<text>`, an empty box without an emoji font | PR #6; the paths are drawn on every host |
| A nav label of only symbols made the id `nav-0--` | Writing tests for hand-typed lines |
| The hero credit sat on the sunburst rays; the keystone letters sat inside their plate | PR #6's before and after plates (viewed) |
| 18 to 24 float-channel `rgba()` stops per drum frame | A new test over the recorded colour stops failed on all four frames before the fix |

## 3. Decisions and corrections

- **Stacking cannot be one constant.** Tailwind finds classes by scanning for literal strings, so a z-index built from a shared table at runtime would be missing from the bundle. `src/test/stacking.test.ts` instead reads the literal class from each component and holds the order. The lucky draw deliberately sits under the docked panels (so the console can still stop its spray) and above the cinematic hud; the spectacle canvases (z 40/41) are proven to sit over the draw and under every panel and modal.
- **A `Dialog.tsx` coverage threshold was tried and removed.** `.tsx` is outside the coverage gate (CLAUDE.md §2), so it would measure nothing. Dialog behaviour is covered by its suite, not by the percentage.
- **One dead guard was removed instead of tested** in `useEscapeKey` (an `indexOf` result that cannot be -1), and one clamp I added to the drum colour helper was removed when the channel range (17 to 236) showed it unreachable.
- **Not taken:** PR #6's own `ADDENDUM-030` text and its visual-pass harness. The five plates that carry evidence for the hero card are committed under `docs/addenda/assets/ADDENDUM-033/`.

## 4. Golden changes

Four drum hashes moved and no call count did; the new hashes equal PR #3's. Nothing else changed.

## 5. What a future reader must know

- **The hero card has not been rendered from this tree.** I viewed PR #6's after plates, where the credit clears the rays and THE reads; the integrated build still needs a person to look. The credit's depth (`z = 0.22`) is not covered by any test (changing it alone passes).
- The mount waits for `document.fonts.ready`, tolerating a face that fails and a browser with no font API. The faces are inlined, so the wait is a tick, not a network trip.
- The console now docks on the left and stretches across a phone; the studio starts collapsed under 1024 px. A jsdom test sits exactly on the 1024 breakpoint, and the default jsdom window is also 1024 wide, so the other DOM tests run in the "desktop, open" state.
- `ActionButton` still shows "playing" by colour alone with no `aria-pressed` (found in Phase 5). Not fixed here.
- About 50 distinct hand-made mutations across this phase (fonts 5, dialog hooks 10, layout and stacking 13, icons and bar 9, hero card 10, drum 4), each required to fail a test. Every one that survived a first draft drove a new test, exposed dead code, or (the hero credit's depth) is recorded above as left uncovered. That shows these breaks are caught, not that nothing is missed.
- Coverage floors ratchet to 82 / 77 / 78 / 83 (measured 82.6 / 77.0 / 78.4 / 83.8). New named 100 percent thresholds: `fonts`, `useEscapeKey`, `useDialogFocus`, `glyphIcons`, `navItems`.

## 6. Validation actually performed

`npx tsc --noEmit` clean; `npm test` 1404 tests pass; `npm run test:coverage` passes its gates; `npm run build` succeeds, and the bundle contains no font CDN request. **Not done:** any browser run, any phone-width or real-GPU check, any look at the icons, the hero card or the panels in this tree. Visual verification pending.
