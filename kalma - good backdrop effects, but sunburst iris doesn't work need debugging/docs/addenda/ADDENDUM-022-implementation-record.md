# ADDENDUM-022 — Implementation record for ADDENDUM-020 and ADDENDUM-021

**Date:** 2026-10-24 · **Relates to:** ADDENDUM-020 (all phases), ADDENDUM-021 (phases 1–5),
CLAUDE.md §1, §2, §5, §6, §7.
**Status:** Accepted.

## 1. What was decided

Both plans were implemented in this greenfield React 19 + Vite 7 + Tailwind 4 host,
following the upstream repo's disciplines (read from `wshyang/verbose-lamp`:
CLAUDE.md, docs/ARCHITECTURE.md). Delivered surfaces:

- `src/shared/lib/random.ts` — mulberry32 + hash01, shared by both plans, tested.
- `src/features/spectacle/` — typed stage (`play/stopAll/dispose`, `EffectHandle.finished`,
  graceful stop fade), lazily created layers (`light-backdrop`, `light-overlay` with
  CSS `mix-blend-mode: screen`; `solid-overlay` normal blending), render loop only
  while effects are live, canvases disposed after 10 s idle, quality tiers
  (`resolveQuality` auto → low on coarse pointer / ≤4 cores), reduced-motion policy,
  WCAG 2.3.1 flash guard (≤3 large flashes/s, attack ≥80 ms, clamps, never throws),
  aria-live announcements, `pointFromElement`/`rectFromElement`.
- Effects: fireworks (9 shell recipes, seeded `planShow` with keep-clear rejection
  over 200 seeds, launch comets, sky glow, blackbody cooling, glitter gates,
  afterimage persistence, crossette splits, emerald pistil), orb transitions
  (2/4 × outward/inward, Bézier arcs, anamorphic flash, collision shockwave +
  spray, `onCovered` inside the flash plateau), sunburst iris + fan, gold-foil
  confetti (burst/rain, terminal-velocity fall, tumbling faces), champagne,
  searchlights, Deco countdown (chains a finale), gilded name reveal
  (`canRenderInDecoGlyphs` with Cinzel fallback), flash; DOM `MarqueeBorder`
  with pure `chasePattern`.
- `src/features/lucky-draw/` — fairness boundary (`pickWinner` on crypto entropy;
  visual RNG separate), `validateEntries`, virtual 16-plate reel (relabels only on
  the hidden back half), `planSpin` (windup/accel/cruise/cubic decel/damped settle,
  exact modular landing over 1000 seeds), `fitLabel`, 289-guest seeded Gatsby
  fixture, suspended Deco Lattice frame + projected drum with motion smear and
  speed sheen, landing chain to confetti + name reveal, aria-live result.
- `src/features/gilded-ui/` — one shared SVG filter chain (luminance → gold-ramp
  `feComponentTransfer` → specular emboss), `GildedGlyph` (emoji or SVG path),
  `GildedTile`, `GildedNavBar` (aria-current, labelled, `gilded-nav-bar__item`),
  `GildedPanel`, pure `goldTable`/`navItems`/`plaqueGeometry` with snapshots.
- `src/features/deco-lattice/` — octilinear lattice, D4/D2 orbits with mirror-line
  dedupe, exact `d/cos(θ/2)` bundle offsets, closed-form octagram, equal-gap reeds,
  stepped border, clasps, seeded wedge walks, four-layer composition (levels are
  supersets; rank-0 frame survives at minimal level), nine-slice-style rectangle
  frames with clear apertures, presets, pure SVG path renderer, brass finish with
  per-layer gradient angles from the seed and layered drop shadow.
- `src/features/spectacle-preview/` — docked non-modal console: backdrop toggles,
  all transition demos with an A/B screen that swaps under `onCovered`, celebration,
  lucky draw, origin picking with crosshair, intensity/seed, draggable keep-clear
  speaker box (ambient show restarts debounced), simulated reduced motion, quality
  read-out, editable emoji,label gold-UI lines, live lattice seed/density/level.

## 2. Deviations from the plans (which won, and why)

1. **Canvas-2D compositor instead of Three.js/WebGL.** This host project does not
   carry the upstream premiere or its Three.js dependency; the plans' constraint
   "effects get their own renderer, work in any host" is honoured with a 2D
   compositor. The compositing grammar is preserved exactly: opaque-light layers
   under `mix-blend-mode: screen`, additive draws, afterimage via
   `destination-out` fade, solid overlay for occluding surfaces. Spark budgets are
   CPU-honest: 6000/2000 (high/low) instead of 40k/12k GPU; trails 7/3 samples.
   Closed-form ballistics are evaluated per sample, never integrated per frame.
2. **Sunburst wipe renders on the solid overlay**, not the light layer: screen
   blending can only add light and cannot hide the old screen; occlusion requires
   normal blending. Orb flash stays on the light layer (white saturates screen
   blending, which does cover).
3. **Lucky-draw drum is a 2D-projected 16-plate cylinder** on its own canvas with
   the Deco Lattice SVG frame, not a PMREM-lit 3D scene. The product rules
   (fairness, reel, spin, fit, announcements) are implemented in full and tested.
4. **Audio (fireworks thump, drum ticks) deferred** — it was optional/off-by-default
   in the plan; no audio code shipped this round.
5. **Deco Lattice integrates as its own feature** (`@/features/deco-lattice`)
   rather than as a `FrameSource` inside the upstream frame engine, which does not
   exist in this host. The SVG renderer + brass finish covers ADDENDUM-021 phases
   1–3 and the 2D surface of phase 5; the WebGL brass material (phase 6) and the
   frame-studio reroll port are moot in this host — the preview panel provides the
   reroll/density/level controls instead.
6. **Playwright e2e remains deferred.** This round adds several interactive
   features, which meets the un-defer trigger noted in ADDENDUM-020 §7; flagged
   here for the next round.

## 3. Validation actually performed

`npx tsc --noEmit`, `npx vitest run` (pure-layer suites: random, ballistics vs
Euler, apex solve, particle pool, shells seed-1925, planShow keep-clear property
over 200 seeds, orb plan, flash guard, iris coverage, confetti terminal velocity,
chase pattern, countdown, Deco glyphs, entries, reel, spin over 1000 seeds,
fitLabel, goldTable snapshot, navItems, plaque snapshots, lattice/symmetry/bundle/
motifs/composition/walks), and `npm run build`.

**Caveat:** this sandbox has no browser. Type-checks, tests pass, builds; visual
verification pending.