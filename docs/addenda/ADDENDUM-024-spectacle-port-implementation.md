# ADDENDUM-024 — Spectacle port, standards alignment, sunburst iris fix and Event Night demo (implementation record)

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-023 (plan), ADDENDUM-020 and ADDENDUM-021 (the plans being implemented); CLAUDE.md §1, §2, §5, §6, §7.
**Status:** Implemented — visual check pending.

## 1. What was decided

The spectacle effects, lucky draw, gilded UI kit and Deco Lattice generator from the `kalma - …` reference checkout were ported into feature folders and brought up to CLAUDE.md §6. The sunburst iris was fixed. The checkout's own host screen was kept as a separate feature and reached from the premiere through a header button; it does not replace the premiere.

| Surface | Where | Notes |
|---|---|---|
| Seeded randomness | `src/shared/lib/random.ts` | `mulberry32`, `hash01`, `randomIndex` |
| Reduced-motion hook | `src/shared/hooks/useReducedMotion.ts` | shared by spectacle, lucky draw, marquee |
| Effects engine | `src/features/spectacle/` | typed `play(id, params)`; `engine/layers.ts` + `engine/effectScheduler.ts`; nine effects |
| Lucky draw | `src/features/lucky-draw/` | fair pick separate from the animation; renders in the shared `Dialog` |
| Gold UI kit | `src/features/gilded-ui/` | shared SVG filter, tile, nav bar, panel; pure `goldTable`, `navItems`, `plaqueGeometry` |
| Deco Lattice | `src/features/deco-lattice/` | pure code under `model/`, SVG frame under `components/` |
| Console | `src/features/spectacle-preview/` | docked non-modal panel, seven focused hooks |
| Demo screen | `src/features/event-night/` | header (with back button), title medallion, ambient show, nav, lucky draw |
| Screen switch | `src/app/DemoHost.tsx`, `hooks/useDemoScreen.ts`, `model/demoScreen.ts` | `#event-night` over the History API |

## 2. Why

The reference checkout had the effects the user wanted, but it was a standalone app whose `App.tsx` replaced everything, and its code ignored this repo's limits. Porting verbatim first and refactoring second let golden recordings prove the visuals survived.

## 3. Relation to the base spec and earlier addenda

- Implements ADDENDUM-020 and ADDENDUM-021. Where the reference checkout deviated from those plans, its deviations stand (below).
- Touches BUILD_PROMPT §3 (visual system) and §7 (interface surfaces) only by adding a screen; the premiere's behaviour is unchanged.

## 4. Deviations and decisions (which won, and why)

1. **Canvas-2D compositor instead of Three.js.** The reference checkout renders effects with 2D canvases (opaque-light layers under CSS `mix-blend-mode: screen`, additive draws, afterimage by `destination-out`, a normal-blended solid overlay). ADDENDUM-020 planned GPU effects; the 2D version won because it adds no WebGL context beside the premiere's, and it is what the user approved visually. Spark budgets are CPU-honest (6000/2000 high/low).
2. **Sunburst on the solid overlay.** `screen` blending can only add light, so it cannot hide the old screen; the iris needs normal blending to cover.
3. **Lucky-draw drum is a 2D projection** of a 16-plate cylinder, not a lit 3D scene. Fairness, reel, spin, label fitting and announcements are implemented and tested in pure modules.
4. **Audio deferred** (optional and off by default in ADDENDUM-020). No audio code shipped.
5. **`gilded-ui` keeps its own `GOLD_RAMPS`.** `gilded-portrait` has a differently shaped, differently coloured ramp set; merging would change the look of one or the other, so they stay separate.
6. **Lucky draw uses the shared `Dialog`** with the original backdrop classes and `z-[35]`. It gains Escape, a focus trap and `aria-modal`; it does not change how it looks. The z-35 backdrop stays below the spectacle canvases (z 40/41) so confetti and the name reveal show on top, as in the reference. This layering is only checked by reading, not in a browser.
7. **Event Night shell is `h-dvh` with an inner scroll area**, not `min-h-screen`, because this repo sets `overflow: hidden` on `html`, `body` and `#root`.
8. **Only one demo is mounted.** Switching unmounts the other, so the premiere's Three.js scene and audio dispose through their existing cleanup and never run beside the 2D canvases. The cost is that the premiere starts over when you come back.
9. **`SECTION_TAGLINES` moved** from `spectacle-preview` into `event-night`; a reusable console should not own one host's copy.

## 5. The sunburst iris bug

`sunburstEffect` compared `irisRadiusAt()` (aspect-corrected units, 1 = viewport height) against `> 1`, then multiplied by the height to get pixels. The radius peaks at about 1.08 for a centred origin on 16:9 and 0.62 on a portrait phone, so the iris was never drawn on portrait and only drew during the full-cover hold on desktop, while `onCovered` still fired and swapped the screen uncovered. A simulation over the 1800 ms effect gave 720 ms drawn on desktop and 0 ms on portrait before the fix, 1710 and 1690 ms after.

The existing test only checked the radius maths, never the draw guard. The fix is a pure `irisRadiusPx` and a `MIN_VISIBLE_RADIUS_PX` guard in pixels. The new tests fail on the old code: the radius is visible through the cover phase (from 100 ms; the cubic ease-in is sub-pixel before that, by design) and reaches the farthest corner in pixels for 1440×900 and 390×844, and the real effect, driven through the recording canvas, emits every wedge fill at mid-cover. The two full-motion sunburst golden snapshots changed (iris 1183 → 2873 draw calls, fan 1530 → 2890); no other snapshot did. The fan grew because its old guard also hid the early part of its growth.

If the iris is still blank in a browser after this, the next suspect is layer sizing in `engine/layers.ts` (a host with `clientHeight` 0).

## 6. Standards alignment

An AST scan of the checkout found 37 units over a limit: functions over 50 lines (stage 135, preview hook 145, panel 113, lucky-draw stage 113, …), more than three parameters (up to seven), and boolean-flag parameters. After the refactor the same scan reports 0 across the ported features, the new `event-night` feature and `src/app`'s new files. Boolean flags became separate functions (`planIris` / `planIrisCrossfade`, `planOrbTransition` / `planOrbCrossfade`) or typed fields (`pistil: 'emerald' | 'gold'`, `motion: 'full' | 'still'`). Components no longer use array methods; the one that did now calls the tested `resolveActiveId`. Test ids follow `{component}__{role}`.

**Known debt:** `src/app/components/PremiereHeader.tsx`, `PremiereTimeline.tsx` and `FrameStudioDock.tsx` already exceeded the 50-line limit before this work. `PremiereHeader` gained four lines; it was not split because this change did not touch it substantively (ADDENDUM-001 §4).

## 7. Validation actually performed

- `npx tsc --noEmit`, `npm test` (59 files, 414 tests), `npm run build` (single-file bundle 1.34 MB, up from 1.25 MB) all pass.
- Golden recordings through a fake 2D context lock all nine effects (15 configurations, full and reduced motion, plus a determinism check), `drawDrum`, `planShow`, `shellSparks`, `planOrbTransition`, `buildDecoLattice` and `planSpin`. The refactor commit changed no snapshot file.
- New tests were written first for `resolveActiveId`, the iris pixel radius and wedge fills, `resolveNavAction` / `taglineFor` and `parseDemoScreen`, and shown failing before the code existed.

**Caveat:** this sandbox has no browser. The work type-checks, tests pass and it builds; visual verification is pending. In particular the iris, the dialog layering, the gold look and the screen switch have not been seen running.

## 8. Manual browser check (for the user)

1. `npm run dev`; the premiere loads as before.
2. Click **Dinner & Dance**. Event Night appears with fireworks and searchlights, the marquee and the gilded bottom bar.
3. Open **Spectacle** → **Sunburst iris**: wedges grow from the origin, SCREEN A/B swaps while covered, then the iris retracts. Repeat in a portrait device emulation (390×844) and with **Deco fan**.
4. Try the four orb transitions, confetti burst and rain, the countdown (it chains the finale), the name reveal, the keep-clear box and the reduced-motion toggle.
5. Choose **Toast** in the bottom bar (orb transition, then confetti rain); choose **Lucky Draw** and spin with 2, 30 and 300 guests; Esc closes it.
6. Click **Premiere**, or the browser's Back button; the premiere returns and starts over.

## 9. Deferred

Playwright e2e stays deferred, but its un-defer trigger in ADDENDUM-001 ("a second interactive feature ships") is now met. Flagged for the next round. Self-hosting the fonts is also still open; offline, the drum and name reveal fall back to Georgia.
