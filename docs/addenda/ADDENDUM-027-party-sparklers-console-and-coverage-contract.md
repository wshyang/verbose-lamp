# ADDENDUM-027 — Party sparklers, the premiere effects console, and the logic-coverage contract

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §4, §5, §6, §7; BUILD_PROMPT §3, §7;
ADDENDUM-020 §3, §3.9; ADDENDUM-023; ADDENDUM-025 §2–§4.
**Status:** Implemented — visual check pending.
**Audience:** the next agent wiring a new effect, and any reader asking "where is the
button the user asked for, and what exactly has to stay at 100%?".

## 1. The word the plans got wrong

ADDENDUM-020 and ADDENDUM-022 write **"orbs"**. The user clarified what they meant:
**party sparklers** — hand-held wire sticks with a sizzling, sparkling tip — not
glowing spheres. The effect ids, types and copy say `sparkler`; the four "orb
transition" configurations keep their old names because they are a camera
transitions between screens, not a light source, and the user's correction was about
the effect.

## 2. The sparkler effect (reusable, modular)

- `src/features/spectacle/effects/sparklers/sparklerPlan.ts` — pure, seeded plan:
  stick positions across a fan, tip drift, per-stick birth, sparkle emission and
  lifetime, `planSparklerStill` for reduced motion, `isSparklerShowDone`.
- `src/features/spectacle/effects/sparklers/sparklersEffect.ts` — the renderer:
  wires, tip glow, sparkle streaks on the `light-overlay` layer, announcing
  "Sparklers lit" to the live region. Registered in `effectRegistry` as `sparklers`
  and typed in `EffectParamsMap`, so the console, the scheduler and the tests all
  see it through the same door.
- Tests: `sparklerPlan.test.ts` (plan invariants across seeds, reduced motion, show
  end), `effects.edges.test.ts` (every registered effect survives its first frame),
  `effects.golden.test.ts` (draw-call digests, quantised — see ADDENDUM-025 §2).

## 3. Two overlays, both wired into the main app

1. **Spectacle console** (`src/app/components/PremiereEffectsDock.tsx`) — the header
   launcher plus a small, non-modal docked panel; nine effects, each playable from
   the title sequence. It is a *panel*, not a dialog, so the sequence keeps running.
2. **Sparkler button** (`src/app/components/PremiereHeader.tsx` + the dock) — one
   button that lights the sparklers over the live stage, with the same announce
   path as the console.

Both live inside `GatsbyPremiere`, on the single spectacle host (`SpectacleLayer`),
so there is one `createSpectacleStage` per premiere and the overlays never compete
for the stage. Panels are fixed/portal-rendered so the canvas cannot clip them.

Every element carries a `data-testid` in `{component-kebab}__{element-role}` form;
`src/app/testidCoverage.test.tsx` fails the build if a testid drifts.

## 4. The coverage contract

The contract is expressed in `vitest.config.ts`, not in prose:

- `coverage.include: ['src/**/*.{ts,tsx}']`.
- `coverage.exclude: LOGIC_SURFACE_EXCLUDES`, where each entry carries its reason as
  a comment: `.tsx` components (DOM, asserted separately), `render/`, `scene/`,
  `scene3d/` (GPU-bound builders and scene graphs), `GatsbySceneManager.ts` (the
  renderer the R3F port replaces and which the screenshot gate still owns),
  `src/test/**` (infrastructure), `src/vite-env.d.ts`.
- Thresholds are raised to **100 %** for statements, branches, functions and lines
  once the closure landed; see ADDENDUM-028 §2–§4 for how the last 74 branches were
  closed and which two lines are deliberately ignored.

The rule the user set is honoured literally: **pure/model/hook logic at 100 %**;
components and the Three.js scene manager are not required to be covered.

## 5. Barrels and layering

`src/barrels.test.ts` loads every feature barrel once, so a new module that forgets
its export fails immediately rather than at runtime. Barrels export *components and
pure functions* only — stores, scene managers and test helpers stay out (the
`premiereStore` case is why the rule exists).

## 6. Verification

`npx tsc --noEmit`, `npm test` and `npm run build` all pass. **No browser in this
sandbox; visual verification pending** — the sparkler fan, the console's layering
over the HUD, and the reduced-motion still frame have been checked only through
plans and DOM tests.
