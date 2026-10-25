# ADDENDUM-025 — Party sparklers and the premiere spectacle console (implementation record)

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-020 §3.1/§3.9, ADDENDUM-021 (plan), ADDENDUM-023/024 (port); BUILD_PROMPT §3, §7; CLAUDE.md §1, §2, §5, §6, §7.
**Status:** Implemented — visual check pending.

## 1. What was decided

The user clarified that what the plans call **"orbs" are really party sparklers with a sparkling effect**. Two consequences, both implemented:

1. A reusable sparkler module: `src/features/spectacle/model/sparklerPlan.ts` (pure plan) plus `effects/sparklers/sparklerRenderer.ts` (shared drawing) and `effects/sparklers/sparklersEffect.ts` (a tenth registered effect, `sparkler`).
2. The `orb-transition` effect now draws its travelling "orb" as a **sparkler head**: warm halos, a white-hot core and a crackling ray spray, with its comet of sparks behind it. The transition choreography (`planOrbTransition`, four configurations, flash, shockwave, `onCovered`) is untouched.

The premiere — *the main app* — now mounts the spectacle console that ADDENDUM-020 §3.9 specified but only Event Night had. A header button (`SpectaclePreviewLauncher`, testid `spectacle-preview__launch`) opens a **small docked, non-modal overlay** (`SpectaclePreviewPanel`, testid `spectacle-preview__panel`). The panel drives every effect, includes the two new sparkler buttons, and can open the lucky-draw dialog; a landed winner now plays confetti **and a five-sparkler fan** behind the name reveal.

## 2. Why

- The clarification is a look requirement, not a new feature: a sparkler is a *head that throws sparks*, whereas the old drawing was three concentric glows. Splitting the plan (seeded recipe) from the renderer (context drawing) means the standalone effect, the transition and any future host all render the same object.
- The console existed but was only mounted inside Event Night. The plan always intended it in `PremiereHeader`; without it, the main app had no way to call any effect.
- Keeping the transition timing intact means the golden snapshots change only in their *visual* recording, never in coverage or `onCovered` semantics.

## 3. How it is built

| File | Role |
|---|---|
| `spectacle/model/sparklerPlan.ts` | Pure: `planSparkler`, `planSparklerShow` (1–5 fan), `sparklerHeat`, `sparklerEmissionRange`, `sparklerSpawn`, `isSparklerShowDone` |
| `spectacle/effects/sparklers/sparklerRenderer.ts` | Pure drawing: `drawSparklerHead` (halos, core, ray spray), `drawSparklerSmoke`, `toPixelSpawn` |
| `spectacle/effects/sparklers/sparklersEffect.ts` | Effect `sparkler`: emits into the particle pool, draws heads and trails; reduced motion keeps the glow and drops the spray |
| `spectacle/model/types.ts`, `engine/effectRegistry.ts` | `SparklerParams`, `sparkler` registry line |
| `spectacle-preview/hooks/useCelebrationActions.ts`, `components/CelebrationSection.tsx` | "Party sparkler" and "Sparkler fan ×5" buttons (testid `spectacle-preview__sparkler`) |
| `app/hooks/usePremiereSpectacle.ts` | Console + lucky-draw state; landed winner plays confetti, a sparkler fan and the name reveal |
| `app/components/PremiereSpectacleOverlay.tsx` | Renders the panel and the draw dialog |
| `app/components/PremiereSurfaces.tsx` (new), `app/GatsbyPremiere.tsx` (thin shell) | The premiere wrapped once in `SpectacleProvider`; the launcher is passed to `PremiereHeader` as a `launcher` node |
| `app/GatsbyPremiere.tsx` → `SpectacleProvider` | One stage for the whole app, so any surface can play an effect |

Determinism: sparks are emitted from **absolute** time (`sparklerEmissionRange`), so splitting a frame across two calls emits exactly the same sparks. Every visual parameter derives from the seed through `mulberry32`/`hash01`; nothing calls `Math.random()` at render time.

Reduced motion: `sparklersEffect` emits nothing and draws the head with zero rays — a steady warm glow. This is visible in the recorded goldens (the full- and reduced-motion snapshots now differ).

## 4. Golden snapshots that changed, and why

- **Sparkler effect:** two new golden configurations (`sparkler single`, `sparkler fan ×5`), full and reduced motion, plus the determinism assertion.
- **Orb transitions:** the four full-motion recordings changed (calls/hashes) because the head drawing changed. Reduced-motion orb recordings are unchanged (they never draw a head).
- **Planning goldens:** `planning.golden.test.ts` now hashes through `spectacle/testing/digest.ts`, which rounds numbers to six decimals. Node 22 and Node 24 disagree in the last ULP of `Math.sin`/`Math.cos`/`Math.hypot`; six shell snapshots failed on this sandbox for that reason and nothing else. Six decimals still catches any real recipe change.

## 5. Impact and what a future reader must know

- `features/spectacle` gains an effect id (`sparkler`) without changing existing ids; `EffectParamsMap` is exhaustive, so any new host must add the params type.
- The premiere is now wrapped in `SpectacleProvider`: one extra `div` between the React root and `<main>`, which owns the effect canvases and the `aria-live` region. `h-dvh`/`w-screen` moved to that wrapper.
- The header accepts an optional `launcher` node. Other hosts can pass their own.
- `spectacle-preview` still owns no host copy; the premiere supplies its own draw wiring.

## 6. Validation actually performed

- `npx tsc --noEmit` ✓, `npm test` ✓ (70 files, 547 tests), `npm run build` ✓ (single file, 1.34 MB).
- New tests: 25 plan tests, 10 renderer tests through the recording canvas, two golden configurations × full/reduced motion + determinism, and 7 digest tests.
- **Caveat:** this sandbox has no browser. The work type-checks, tests pass and it builds; the *visual* sparkler, the panel placement over the premiere and the draw layering have not been seen running. The manual check is in ADDENDUM-027 §8.
