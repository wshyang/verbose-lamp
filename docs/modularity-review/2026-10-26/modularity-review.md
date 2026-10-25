# Modularity Review

**Scope**: Entire codebase (`src/app`, 17 features under `src/features`, `src/shared`, `src/test`), read together with `docs/ARCHITECTURE.md`, `docs/ADDENDA.md` and `CLAUDE.md`
**Date**: 2026-10-26

## Executive Summary

verbose-lamp is a client-only React/Three.js title sequence ("The Great Gatsby") with a spectacle effects suite, an Event Night demo, an avatar studio and a golden QR generator. Its feature-first layout is largely healthy: most features reach each other through barrels, the image and spectacle internals are pure and well isolated, and `event-night` composes its neighbours through contracts. The stated plan is to lift features into other apps, so every feature boundary has to be treated as high [distance](https://coupling.dev/posts/dimensions-of-coupling/distance/). Against that bar, the main problem is the frame-style rules, which are re-implemented in three features with different behaviour. Two structural problems follow from it: barrels that mix pure contracts with React/Three runtime (so consumers deep-import past them), and `premiere` owning the Frame Studio's editor state. The remaining findings are lower-cost extraction blockers.

## Coupling Overview

| Integration | [Strength](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | [Distance](https://coupling.dev/posts/dimensions-of-coupling/distance/) | [Volatility](https://coupling.dev/posts/dimensions-of-coupling/volatility/) | [Balanced?](https://coupling.dev/posts/core-concepts/balance/) |
| ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `premiere` / `frame-studio` -> `art-deco-frame` (frame style rules) | [Functional](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (duplicated rules) plus [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | High (feature boundary, extraction planned) | High (core) | No: Issue 1 |
| `art-deco-frame`, `title-customizer`, `app` -> deep paths in `deco-lattice`, `premiere` | [Intrusive](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (past the barrel) | High | High / Medium | No: Issue 2 |
| `premiere` -> `frame-studio` (`useFrameStudio`) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/), wrong direction | High | High (both core) | No: Issue 3 |
| `spectacle-preview` / `event-night` / `app` <-> `spectacle` (celebration recipe, lattice and nav controls) | [Functional](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (copied recipes) | Medium to High | High (core) | No: Issue 4 |
| `background-removal`, `enamel-backdrop`, `gilded-portrait` -> `gilded-portrait`, `qr-generator` (utilities) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) via barrels that carry React | High | Low | Tolerable, extraction blocker: Issue 5 |
| `premiere` hooks <-> `premiere` store (mirrored state, ref plumbing) | [Functional](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Low (same module) | High | Balanced, but accidental complexity: Issue 6 |
| `event-night` -> `spectacle`, `spectacle-preview`, `lucky-draw`, `gilded-ui`, `deco-lattice` | [Contract](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (barrels) | Medium | Medium | Yes |
| `avatar-studio` -> `background-removal`, `enamel-backdrop`, `face-detection`, `gilded-portrait` | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) (orchestrator, typed layer contracts) | Medium | Medium | Yes (orchestrators are expected to know their parts) |
| `qr-generator`, `research`, `title-customizer`, `lucky-draw` -> `shared/ui`, `shared/lib` | [Contract](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Medium | Low | Yes |
| `spectacle` internals (engine, effects, model, particles) | [Model](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) | Low (same module) | High | Yes (high strength, low distance) |

## Issue: Frame-style rules are re-implemented in three features

**Integration**: `art-deco-frame` <-> `premiere` (`scene/styleClamp.ts`) <-> `frame-studio` (`model/studioFormula.ts`, `model/studioActions.ts`)
**Severity**: Critical

### Knowledge Leakage

What counts as a legal frame style is business knowledge owned by the frame grammar, but three modules each encode it. The rule "a formula level is a whole number 1 to 4" exists three times, and each copy answers invalid input differently:

- `art-deco-frame/engine/frameGrammar/generative.ts:17`, `clampGenesisLevel`: non-finite input falls back to 2.
- `premiere/scene/styleClamp.ts`, `clampFormulaLevel`: NaN falls back to 1.
- `frame-studio/model/studioFormula.ts`, `clampLayerLevel`: NaN is not handled, so `Math.min(4, Math.max(1, Math.round(NaN)))` returns NaN.

`premiere`'s `clampFrameStyle` also rebuilds a `FrameFormula` field by field, so a field added to `FrameFormula` is silently dropped on its way into the scene. The file already records one such incident: `clampScreenBorderStyle` says it passes the other fields through so that the lattice `pattern` and `seed` "cannot be dropped by a clamp that predates them". `frame-studio` additionally consumes a large part of the grammar's internal vocabulary (`DEFAULT_FRAME_LAYERS`, `FRAME_LAYER_SOURCES`, `INTRICACY_PRESETS`, `withGene`, `SIGNATURE_GENOME`, `GENE_DEFINITIONS` and others) through the `art-deco-frame` barrel. This is [functional coupling](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/): duplicated business rules that nothing ties together.

### Complexity Impact

A developer changing the formula (for example adding a fifth level or a new pattern source) has to remember three clamp sites, one of which lives in a different feature and renderer layer. The knowledge is implicit, so the compiler cannot help, and the three behaviours differ in edge cases, so each site has to be understood separately. This pushes against the [4 ± 1 working-memory limit](https://coupling.dev/posts/core-concepts/complexity/) for a task that should be local to one feature.

### Cascading Changes

- Adding a formula field: `art-deco-frame` types, `premiere` `clampFrameStyle` (must be extended or the field is dropped), `frame-studio` `studioFormula`/`studioActions`, and their tests.
- Raising the maximum level from 4: the three clamps, the `1..4` slider in the Frame Studio, and the lattice source's own clamp (`latticeSource.ts`).
- Extracting `art-deco-frame` for another app: `premiere` and `frame-studio` each carry their own idea of a valid style and will drift from the extracted copy.

The area is the most volatile in the project (frame studio, genome, lattice and border work account for a large share of commits), and the reuse plan makes the distance high. This is the textbook [unbalanced](https://coupling.dev/posts/core-concepts/balance/) case.

### Recommended Improvement

Make `art-deco-frame` the single owner of the rules and publish them as a [contract](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/): `normalizeFrameStyle`, `normalizeScreenBorderStyle` and `clampFormulaLevel` (one NaN policy). `premiere` and `frame-studio` call these and delete their copies; `clampFrameStyle` becomes spread-then-normalise so unknown fields cannot be dropped. Where `frame-studio` needs grammar vocabulary (layer sources, presets, gene definitions), expose a small `FrameStudioVocabulary` export grouped for that purpose instead of many individual internals.

Trade-off: `art-deco-frame`'s public surface grows by a handful of functions that it must keep stable, and `premiere`'s clamp tests move into `art-deco-frame`. That is a good exchange: the cost lands in the one feature that is meant to change when the rules change. Behaviour will shift for invalid input (one NaN policy instead of three), so this needs an addendum that names the chosen fallback.

## Issue: Barrels mix pure contracts with React/Three runtime, so consumers deep-import

**Integration**: `art-deco-frame/engine` -> `deco-lattice/model/*`; `title-customizer` -> `premiere/model`, `premiere/data`; `premiere/model/types` -> `art-deco-frame/model/types`; `app/components/CinematicStage` -> `premiere/scene3d/*`, `premiere/scene/sceneApi`
**Severity**: Significant

### Knowledge Leakage

`CLAUDE.md` and `docs/ARCHITECTURE.md` say a feature's barrel "is the only door". In practice consumers reach past it into [private interfaces](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) because a single barrel cannot serve both a pure consumer and a React/Three consumer:

- `art-deco-frame/engine/frameGrammar/edgeBorder.ts` and `latticeSource.ts` import `deco-lattice/model/{nineSlice,tone,lattice}` directly; the comment explains that the `deco-lattice` barrel exports a React component and the engine must stay pure.
- `title-customizer` imports `premiere/model/types` and `premiere/data/sequence`; `premiere`'s barrel would drag in the controller hooks.
- `premiere/model/types.ts` imports `art-deco-frame/model/types` rather than the barrel, which loads Three.
- `app/components/CinematicStage.tsx` imports `PremiereCanvas`, `premiereStore` and `sceneApi` by path, because the `premiere` barrel exposes neither the canvas nor the store.

`src/barrels.test.ts` only checks that each barrel loads and is non-empty. Nothing fails when a deep path is imported, so every deep import is a silent, intentional-looking exception that the next contributor can copy.

### Complexity Impact

The set of "supported" imports is not defined by the code. A developer has to read comments to learn which deep paths are tolerated, and a rename of `nineSlice.ts` or `premiereStore.ts` breaks a consumer that never appeared in a barrel diff. The same dependency graph also decides what an extracted package has to carry: pulling out `art-deco-frame` today means pulling specific files of `deco-lattice`, not a package surface.

### Cascading Changes

- Moving or splitting `deco-lattice/model/*` breaks `art-deco-frame`'s engine.
- Changing where `HeroTitleConfig` lives breaks `title-customizer` (five import sites).
- Replacing the premiere store with another state container breaks `app`, which imports it by path.

### Recommended Improvement

Give each feature that has both a pure and a runtime face two published entries, for example `@/features/deco-lattice/model` (pure contract) and `@/features/deco-lattice` (runtime, including components). The first is the entry `art-deco-frame` and `title-customizer` use; the second is for hosts. For `premiere`, export the canvas and store handle explicitly from the runtime barrel so `app` stops importing by path. Back it with a test, next to `barrels.test.ts`, that scans imports and fails on any `@/features/<name>/<path>` that is not one of the declared entries.

Trade-off: each such feature gets a second entry point to maintain, and the new test needs a short allowlist while the existing exceptions are migrated. This turns an informal rule into one the build enforces, and it is the cheapest way to make the planned extraction mechanical.

## Issue: `premiere` owns the Frame Studio's editor state and defines its port twice

**Integration**: `premiere` (`hooks/usePremiereController.ts`, `scene/sceneApi.ts`) -> `frame-studio`
**Severity**: Significant

### Knowledge Leakage

`frame-studio` is documented as an editor that "talks to a small `FrameStudioTarget` port, so an editor can bind to another renderer". `usePremiereController` nevertheless calls `useFrameStudio(...)` itself and returns the result as `frameStudio`, so the runtime feature depends on the editor feature and on its hook shape. To avoid also importing the studio's target type, `sceneApi.ts` redefines the same three methods as `FrameStudioScenePort` and relies on `sceneApi.test.ts` to keep the two "structurally identical". That is [model coupling](https://coupling.dev/posts/dimensions-of-coupling/integration-strength/) in the wrong direction, kept consistent by a test instead of by a shared contract.

### Complexity Impact

The dependency direction contradicts the documented one (host composes features; features do not compose each other's UI state). `premiere` cannot be reused without `frame-studio`, and `frame-studio` cannot be reused without something shaped like `PremiereSceneApi`'s three methods. A developer reading `usePremiereController` sees a transport hook, a settings hook, a runtime hook and an unrelated editor hook in one function.

### Cascading Changes

- Adding a studio operation (for example a "screen-border seed" setter) requires an edit to `FrameStudioTarget`, to `FrameStudioScenePort`, to `PremiereSceneApi`, to `storeSceneApi`, and to the structural-equality test.
- Replacing the studio (for another editor UI) forces a change to `premiere`'s controller.

### Recommended Improvement

Let the host compose them: `app` calls `useFrameStudio(getScene)` where `getScene` is a getter the premiere controller exposes. `usePremiereController` drops its `frame-studio` import and its `frameStudio` field. Delete `FrameStudioScenePort`; `PremiereSceneApi` already satisfies `FrameStudioTarget` structurally, so a compile-time assignment in `app` is enough to keep them aligned, and no mirror test is needed.

Trade-off: `PremiereSurfaces` gains one more line of wiring and the controller loses a field, so tests that read `premiere.frameStudio` change. In return, each feature becomes reusable without the other, which is the property the architecture document already claims.

## Issue: The spectacle console has low cohesion and the celebration recipe is copied

**Integration**: `spectacle-preview` <-> `spectacle`; `app` and `event-night` -> `spectacle` (`play(...)` recipes)
**Severity**: Significant

### Knowledge Leakage

Two kinds of knowledge sit in the wrong place.

1. **Unrelated responsibilities share a module.** `spectacle-preview` is the docked console for driving effects, but its hooks and panel also own the Deco Lattice controls (`useLatticeControls`) and the gold nav-bar text editor (`useGoldUiLines`, `PanelExtras.tsx`). Only the Event Night title medallion and nav bar use them. `spectacle-preview` therefore imports `gilded-ui`, and `event-night` reads lattice settings out of the console's state object. Low strength combined with co-location is a symptom of [low cohesion](https://coupling.dev/posts/core-concepts/balance/).
2. **The same celebration recipe is written more than once.** When the lucky draw lands, `app/hooks/usePremiereSpectacle.ts` plays confetti, five sparklers and the name reveal with seed 1925; `event-night/hooks/useEventNight.ts` plays confetti and the name reveal with `Date.now() % 100000`; `spectacle-preview/hooks/useCelebrationActions.ts` holds a third copy of the subtitle literal `'Lucky draw winner'` for its demo button. The default seed `1925` is declared in about 20 places across 8 features (including two definitions of `LATTICE_DEFAULT_SEED`: `frame-studio/model/patternSeed.ts` and `art-deco-frame/.../latticeSource.ts`).

### Complexity Impact

A change to "what a winner celebration looks like" has no home. The two hosts already disagree (sparklers present in one, absent in the other; deterministic versus time-based seed), and nothing says whether that is intended. Because the console is where new effects get added, it grows with every effect and with every host that wants something custom in it.

### Cascading Changes

- Adding an effect to the winner moment means editing two hosts and the console demo.
- Changing the default seed means touching about 20 sites; missing one makes a preset render differently in different places.
- A third host (another demo screen) would copy the recipe a third time, and could not drop the lattice and nav sections from the console without editing it.

### Recommended Improvement

Publish a pure, tested `winnerCelebrationPlan(winner, options)` from `spectacle` (returning the list of `play` calls), used by both hosts and by the console demo; each host passes its own seed policy. Give `SpectaclePreviewPanel` a slot for host-owned sections and move `useLatticeControls` and `useGoldUiLines` with their sections into `event-night`. Define the default seed once (for example `DEFAULT_SEED` in `shared/lib/random`) and import it.

Trade-off: the plan function adds a small API to `spectacle`, and the panel slot adds a prop to the console. Hosts keep the ability to differ, but the difference becomes explicit and visible in one call instead of accidental across files.

## Issue: The image pipeline borrows generic utilities from sibling features

**Integration**: `background-removal` -> `gilded-portrait` (`boxBlur`); `enamel-backdrop` -> `gilded-portrait` (`GOLD_RAMPS`, `buildGoldRampLut`, `GoldRampId`); `gilded-portrait` -> `qr-generator` (`toSafeFileStem`)
**Severity**: Minor

### Knowledge Leakage

Three small, generic things live inside feature barrels that also export React modals:

- `boxBlur` (a raster operation) is exported from `gilded-portrait`'s `tone.ts`, and used by `background-removal` and `avatar-studio`, while `shared/lib/raster` already holds resampling and morphology.
- The gold ramps and their LUT builder are `gilded-portrait`'s, but `enamel-backdrop` draws its gold from them and `avatar-studio` reaches both.
- `gilded-portrait/export.ts` imports `toSafeFileStem` from `qr-generator`, which itself only re-wraps `shared/lib/svgExport`.

The architecture document says `background-removal` and `enamel-backdrop` "have no React and no knowledge of this app" and "any one can be reused alone". Because the shared items sit behind barrels that include the modal and launcher components, that is not true at the import level. `avatar-studio` -> these four features is a legitimate orchestrator relationship and is not flagged.

### Complexity Impact

Low. The utilities are stable, so there is little cascade. The cost is conceptual: a reader looking for "blur" or "gold" must know which feature happens to own it.

### Cascading Changes

Extracting `background-removal` or `enamel-backdrop` into another app pulls in `gilded-portrait`'s UI and, through its export module, the QR generator. Volatility is low, so this is a one-time extraction cost, not a recurring one; that is why the severity is Minor.

### Recommended Improvement

Move `boxBlur` into `shared/lib/raster`, move the gold ramps and LUT into a small shared module (for example `shared/lib/gold`), and have `gilded-portrait/export.ts` import `toSafeFileStem` from `shared/lib/svgExport` directly. Each feature keeps re-exporting what it exports today, so no call site has to change at once.

Trade-off: `shared/` grows slightly; this is acceptable because the items are used by more than one feature, which is the rule `docs/ARCHITECTURE.md` already states for adding shared code.

## Issue: `premiere` keeps several layers around its own state

**Integration**: `premiere/hooks/*` <-> `premiere/scene3d/premiereStore` (through `storeSceneApi` and `managerRef`)
**Severity**: Minor

### Knowledge Leakage

The playback and settings state is held in more than one place inside one module: the zustand store owns `currentTime`, `isPlaying`, `cameraMode`, `isNitrateForced` and `heroConfig`; `usePlaybackDisplay` and `usePremiereSettings` hold React copies of them (the first fed by throttled telemetry, the second set by the transport hooks in parallel with the store). `storeSceneApi` then adapts the store back to the `PremiereSceneApi` that the hooks call through `managerRef`. The imperative manager that motivated this port was removed in ADDENDUM-030, but `managerRef` is still threaded through 31 sites in the hooks.

### Complexity Impact

The coupling is [balanced](https://coupling.dev/posts/core-concepts/balance/) in the model's sense, because strength is high and distance is low. The cost is cognitive: to know the current camera mode you must decide whether to trust the store, the hook state or the last telemetry tick, and a setter has to update two places in the right order.

### Cascading Changes

Adding a playback setting means a store field, a store action, a `PremiereSceneApi` method, an adapter line, a settings-hook state, a transport or options hook, and the controller's return shape. Premiere is a core area, so this path will be walked again.

### Recommended Improvement

Let React read the store through zustand selectors (`useStore(store, selector)`) for time, play state, camera and hero config, and drop the mirrored hook state and telemetry throttle where the store can serve it. Keep `PremiereSceneApi` as the write port, but pass `store.getState` (or the adapter) directly to hooks instead of through `managerRef`.

Trade-off: React re-renders become a function of selectors, so the 48 ms telemetry throttle's protection against re-rendering the HUD every frame must be preserved (a selector with an equality function, or a throttled subscription). This is the least urgent change here and is best done when the next premiere setting is added.

---

_This analysis was performed using the [Balanced Coupling](https://coupling.dev) model by [Vlad Khononov](https://vladikk.com)._
