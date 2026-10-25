# Remediation plan — modularity review findings (verbose-lamp)

## Context
The 2026-10-26 modularity review (`docs/modularity-review/2026-10-26/modularity-review.md`) found six imbalances. You planned to lift features into other apps, so every feature boundary counts as high distance. This plan turns each finding into tickable tasks. Every phase is behaviour-preserving, except two stated changes: invalid-level handling (Phase 1) and the premiere console losing two sections (Phase 4).

## Working agreements (CLAUDE.md)
- **Tests first** (§2): a failing test for the new pure module, then the move, then green.
- **Limits** (§6): functions ≤ 50 lines (target 20), files ≤ 800 lines, ≤ 3 parameters, no boolean flag parameters. If a touched function or file is in `src/test/disciplineBaseline.ts`, move its row. Never add one.
- **Addendum in the same change** (§1): one per phase, plus a row in `docs/ADDENDA.md`. The next free number is 037. Do not cite a number before its file exists: `src/addenda.test.ts` scans `docs/` and `src/` and fails on a dangling `ADDENDUM-NNN`.
- **Gate** at the end of every phase: `npx tsc --noEmit`, `npm test`, `npm run test:coverage` (the 100 % floor must hold, no `v8 ignore`), `npm run build`. The sandbox has no browser, so `npm run e2e` and the likeness gate are not run here. Run them locally on darwin. Never run `e2e:update` to turn a red run green.
- **Commits**: one per phase, with the `Validation:` line and the browser caveat. I commit only when you tell me to; otherwise phases accumulate in the working tree and each ends with a gate report.
- **Order**: 0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 5 asserts the end state of 1–4, so it comes after them. Phase 6 is independent and may be dropped.

## Decisions and assumptions (veto at approval)
- Level policy (revised): the NaN/Infinity difference between the sites is legitimate, so it is **kept**. `clampFormulaLevel` (requests: infinity pins to an end, NaN → 1) and `resolveGenesisLevel` (grammar drawing: non-finite → 2) live side by side in `styleRules.ts`. Only the Frame Studio's NaN changes (passed through → 1).
- Phase 4 **moves** the "GOLD UI KIT" and "DECO LATTICE" sections out of the shared console into Event Night. The premiere console loses both. They control nothing there: only the Event Night medallion and nav bar read them.
- The premiere and Event Night celebrations stay different: sparklers vs none, fixed vs time-based seed. Phase 4 only makes the difference explicit in one place.
- A `FrameStudioVocabulary` grouping export (from the review) is **deferred**. It is not needed to remove the duplication.
- Test files and `testing/` helper folders are exempt from the import-boundary rule in Phase 5.
- The review said `premiere/model/types.ts` → `art-deco-frame/model/types` loads Three. That edge is `import type`, which is erased at build, so it is path hygiene only. Task 5.5 covers it.

---

## [x] Phase 0 — Baseline and tracking
- [x] 0.1 Tree clean apart from `docs/modularity-review/`. Staying on `integrate/best-of-pr2-6`.
- [x] 0.2 Baseline (2026-10-26): tsc clean; 585 test files, 4320 tests pass; coverage 100 % statements (5430), branches (1891), functions (1277), lines; `DISCIPLINE_DEBT` = 50 rows.
- [x] 0.3 Checklist copied here.
- [x] 0.4 Review docs committed (0b8609ad).

## [x] Phase 1 — Finding 1 (Critical): one owner for frame-style rules
Goal: `art-deco-frame` owns "what is a legal frame style". Premiere and the Frame Studio call it.

- [x] 1.1 **RED**: new `src/features/art-deco-frame/engine/frameGrammar/styleRules.test.ts` covering:
  - `clampFormulaLevel`: rounds to 1..4; NaN, +Infinity and -Infinity give 2.
  - `normalizeFrameStyle`: clamps intricacy to 0..1, level, genome and each layer's level; keeps an unknown extra formula field (the guard against the drop bug); `layers` is always an array; `seed` is kept only when defined.
  - `normalizeScreenBorderStyle`: weight 0..1, genome clamped, `pattern` and `seed` pass through.
- [x] 1.2 **GREEN**: new `.../frameGrammar/styleRules.ts` exporting `FORMULA_LEVEL_MIN` (1), `FORMULA_LEVEL_MAX` (4), `DEFAULT_FORMULA_LEVEL` (2, equal to `DEFAULT_FRAME_FORMULA.level`), `clampFormulaLevel`, `clampIntricacy`, `normalizeFrameStyle`, `normalizeScreenBorderStyle`. Move the bodies from `premiere/scene/styleClamp.ts`, switching to spread-then-normalise. Use `DEFAULT_FRAME_STYLE` and `DEFAULT_SCREEN_BORDER_STYLE` from `types.ts` for defaults.
- [x] 1.3 Export them from `frameGrammar/index.ts` (the feature barrel already does `export * from './engine/frameGrammar'`).
- [x] 1.4 Replace the grammar's own copies:
  - `generative.ts:17`: delete `clampGenesisLevel` and use `clampFormulaLevel` at the call (`:258`).
  - `latticeSource.ts:79`: replace the inline `Math.min(4, Math.max(1, …))` with `clampFormulaLevel`.
  - Rename `clampGenesisLevel` to `clampFormulaLevel` in `generative.p3/p5/p6.test.ts`, importing from `./styleRules`.
- [x] 1.5 Replace premiere's copies:
  - `premiere/scene/styleClamp.ts`: delete `clampIntricacy`, `clampFormulaLevel`, `clampFrameStyle`, `clampScreenBorderStyle`. Keep the time and chapter clamps (`clampSequenceTime`, `clampChapterIndex`, `chapterJumpTarget`, `clampOr`).
  - `premiere/scene3d/premiereStore.ts`: import `normalizeFrameStyle` and `normalizeScreenBorderStyle` from `@/features/art-deco-frame` (it already imports from there).
  - Migrate the matching cases from `styleClamp.test.ts` and `.p2/.p3/.p5/.p6` into `styleRules.test.ts`. Keep the cases for the clamps that stay. Update the store tests to the new NaN result.
- [x] 1.6 Replace the Frame Studio's copies:
  - `frame-studio/model/studioFormula.ts`: delete `clampLayerLevel`, `MIN_LAYER_LEVEL`, `MAX_LAYER_LEVEL`. Use `DEFAULT_FORMULA_LEVEL` in place of `FALLBACK_LAYER_LEVEL`.
  - `studioActions.ts` and `studioFormula.test.ts`: call `clampFormulaLevel`.
  - Grep `frame-studio/components` for the literal level bounds (`min={1}` / `max={4}` or `[1, 2, 3, 4]`) and use `FORMULA_LEVEL_MIN` and `FORMULA_LEVEL_MAX`.
- [x] 1.7 `grep -rn "Math.min(4" src/features` shows no frame-formula level clamp left outside `styleRules.ts` (the Deco Lattice's own layer count is a separate contract, noted in the addendum). Golden and snapshot tests must be unchanged; if one moves, explain it in the addendum.
- [x] 1.8 Addendum 037 + register row. It states the two level policies, the removed copies and the one behaviour delta (Frame Studio NaN).
- [x] 1.9 Gate.

## [x] Phase 2 — Finding 5 (Minor): image features stop borrowing from siblings
Goal: `background-removal`, `enamel-backdrop` and `gilded-portrait` import no other feature.

- [x] 2.1 **boxBlur → shared raster.**
  - Find its tests: `grep -rn boxBlur src --include='*.test.*'`. Move them to `src/shared/lib/raster/blur.test.ts` (RED against the new path).
  - New `src/shared/lib/raster/blur.ts` with `boxBlur`, `BlurOptions`, `blurRows`, `blurColumns`, `preserveMean`, moved from `gilded-portrait/tone.ts:46-120`.
  - `hasRasterShape` (`tone.ts:17`) and `clamp`: if `tone.ts` still needs them, export them from `raster` instead of duplicating.
  - Export from `shared/lib/raster/index.ts`.
  - `tone.ts` imports it. `gilded-portrait/index.ts` keeps re-exporting `boxBlur` and `BlurOptions` so its public API is unchanged.
  - Point `background-removal/subjectAlpha.ts` and `avatar-studio/compose.ts` at `@/shared/lib/raster`.
- [x] 2.2 **Gold ramps → shared.** (done as `src/shared/lib/goldRamp/`, not `gold/`: `gilded-ui` has an unrelated `GOLD_RAMPS` and the name should stay distinct)
  - New `src/shared/lib/goldRamp/` with `goldRamp.ts` (`GOLD_RAMPS`, `buildGoldRampLut`) and the types `GoldRampId`, `GoldRampDefinition`, `GoldRampStop`, plus `index.ts`. Move the ramp tests from `gilded-portrait/goldRamp*.test.ts`.
  - `gilded-portrait/types.ts` re-exports the three types, as it already does for the raster types.
  - `gilded-portrait/index.ts` re-exports `GOLD_RAMPS` and `buildGoldRampLut`.
  - Point `enamel-backdrop/renderBackdrop.ts`, `enamel-backdrop/types.ts` and `avatar-studio/{types,compose,hooks/useAvatarLook}.ts` at `@/shared/lib/gold`.
- [x] 2.3 **File stem.**
  - `gilded-portrait/export.ts`: import `toSafeFileStem` from `@/shared/lib/svgExport`. Its call already passes the `'gilded-portrait'` fallback, so behaviour is identical.
  - Check `export.p3/p6.test.ts` for mocks of `@/features/qr-generator` and retarget them.
  - `qr-generator`'s barrel export `toSafeFileStem` stays: its own tests and mock use it.
- [x] 2.4 Verify with `grep -rn "@/features/" src/features/{background-removal,enamel-backdrop,gilded-portrait,face-detection}` (non-test). Expect no hits.
- [x] 2.5 Addendum 038 + register row, and fix the `docs/ARCHITECTURE.md` shared-lib map (`raster/blur`, `gold/`). Gate.

## [x] Phase 3 — Finding 3 (Significant): the host composes the Frame Studio
Goal: `premiere` no longer imports `frame-studio`, and there is one port type, not two.

- [x] 3.1 **RED**: add a compile-time test in `app` (for example `src/app/sceneBinding.test.ts`): `expectTypeOf<PremiereSceneApi>().toExtend<FrameStudioTarget>()`. It replaces `sceneApi.test.ts:33-49`.
- [x] 3.2 `premiere/hooks/usePremiereController.ts`: remove the `useFrameStudio` import and call (`:22`) and the `frameStudio` field. Return a stable `getSceneApi = useCallback(() => managerRef.current, [])`.
- [x] 3.3 `app/components/PremiereSurfaces.tsx`: `const frameStudio = useFrameStudio(premiere.getSceneApi)`, imported from `@/features/frame-studio`. Pass `studio={frameStudio}` to `FrameStudioDock` (`:77`). The call itself is the compile-time check that the types agree.
- [x] 3.4 `premiere/scene/sceneApi.ts`: delete `FrameStudioScenePort` (`:29`) and its doc comment. Delete the `FrameStudioScenePort` describe block and the `FrameStudioTarget` import in `sceneApi.test.ts`.
- [x] 3.5 Update the tests that read `premiere.frameStudio` (their studio behaviour moved to `src/app/frameStudioBinding.test.tsx`; `PremiereSurfaces` outgrew its debt row, so its chrome state moved to `app/hooks/usePremiereChrome.ts` and the row is lowered 75 → 72): `premiere/hooks/usePremiereController{,.p3,.p4}.test.tsx`, `usePremiereController.test.ts`, `app/components/PremiereSurfaces.test.tsx`, `app/testidCoverage.p4.test.tsx`.
- [x] 3.6 Verify with `grep -rn "frame-studio" src/features/premiere` (non-test). Expect no hits.
- [x] 3.7 Addendum 039 + register row. Gate. The Frame Studio must still drive the scene: the `getTarget` getter is lazy, so timing is unchanged.

## [ ] Phase 4 — Finding 4 (Significant): console cohesion, one celebration recipe, one seed
Three independent sub-tasks, in this order.

**4A. One default seed**
- [ ] 4A.1 Add `DEFAULT_SEED = 1925` (with the existing "year of the novel" note from `enamel-backdrop/goldLeaf.ts`) to `shared/lib/random.ts`, with a test.
- [ ] 4A.2 Replace the default-seed uses (`?? 1925`, `const DEFAULT_SEED = 1925`, preset literals) with the import. Sites: `spectacle/effects/{champagne,fireworks(×3 incl. show.ts),searchlights,confetti}`, `spectacle/model/sparklerPlan.ts` (`DEFAULT_SPARKLER_SEED`), `spectacle-preview/{hooks/useStageSettings,hooks/useLatticeControls,components/StageSettingsSection}`, `deco-lattice/{model/presets (4),model/composition (2),hooks/useDecoLatticePaths}`, `lucky-draw/components/LuckyDrawStage.tsx`, `art-deco-frame/.../{latticeSource,types}` (`LATTICE_DEFAULT_SEED`, `DEFAULT_SCREEN_BORDER_SEED`), `frame-studio/model/patternSeed.ts`, `enamel-backdrop/goldLeaf.ts` (`LEAF_SEED`), `app/hooks/usePremiereSpectacle.ts`.
- [ ] 4A.3 Leave the salts alone: `sparkSpray.ts` `hash01(pair, 1925)` and `sparklerTransitionEffect.ts` `1925 + index * 7919`. They are hash inputs, not defaults. The values are unchanged, so no golden recording moves.
- [ ] 4A.4 `grep -rn "1925" src --include='*.ts' --include='*.tsx'` (non-test) leaves only the shared definition and the two salts.

**4B. One winner-celebration recipe**
- [ ] 4B.1 **RED**: `spectacle/model/winnerCelebration.test.ts` for `winnerCelebration({ name, subtitle?, seed, sparklerCount })`. It returns typed params for `confetti` (burst, origin `{x: .5, y: .4}`), `sparkler` (null when `sparklerCount` is 0; otherwise count, seed, intensity 0.9) and `name-reveal` (subtitle defaults to `DEFAULT_WINNER_SUBTITLE`). Also test `playWinnerCelebration(play, celebration)` with a recording fake of `play`.
- [ ] 4B.2 **GREEN**: `spectacle/model/winnerCelebration.ts`, with a single `DEFAULT_WINNER_SUBTITLE`, exported from the `spectacle` barrel.
- [ ] 4B.3 Use it in `app/hooks/usePremiereSpectacle.ts` (seed 1925, 5 sparklers) and `event-night/hooks/useEventNight.ts` (seed `Date.now() % 100000`, 0 sparklers). Use `DEFAULT_WINNER_SUBTITLE` in `spectacle-preview/hooks/useCelebrationActions.ts` (`playNameReveal`).
- [ ] 4B.4 Do not edit the existing hook tests. They assert the `play` calls and now guard behaviour preservation.

**4C. Move host-only sections out of the console**
- [ ] 4C.1 `spectacle-preview`: export `Section`, `SliderRow` and `ActionButton` from the barrel (they are in `components/PanelBits.tsx`). Event Night needs them to build its sections.
- [ ] 4C.2 `SpectaclePreviewPanel` accepts `children` and renders them after the LUCKY DRAW section. Remove `<GoldUiSection>` and `<LatticeSection>` (`:62-63`), `PanelExtras.tsx`, `useLatticeControls`, `useGoldUiLines`, their fields in `useSpectaclePreview`, the stub fields in `testing/stubPreview.ts`, and the `gilded-ui` import.
- [ ] 4C.3 `event-night`:
  - Add `hooks/useLatticeControls.ts` and `hooks/useGoldUiLines.ts` (moved), and `components/EventNightConsoleSections.tsx` (the two sections moved).
  - Move `DEFAULT_NAV_LINES` from `spectacle-preview/data/previewCatalogue.ts` to `event-night/data/`.
  - `EventNightStage.tsx` owns the controls (lines 48 and 53 read `latticeSeed`, `navItems` etc. from the console today). It passes the sections as `children` to `<SpectaclePreviewPanel>`.
  - Rename testids to `event-night__nav-lines`, `event-night__lattice-*` (CLAUDE.md §5). Update the unit tests and `src/test/e2eContract.test.ts` expectations. `e2e/` has no selector on the old ids.
- [ ] 4C.4 Move the tests with their code. The panel's own tests keep only what the panel still renders. Add one test that `children` render inside the panel.
- [ ] 4D Addendum 040 + register row. It records that the premiere console no longer shows the two sections and the testid renames. Gate.

## [ ] Phase 5 — Finding 2 (Significant): enforced entry points and a dependency table
Goal: the "barrel is the only door" rule becomes a test. Run after Phases 1–4 so few exceptions remain.

- [ ] 5.1 **Pure entries.**
  - `deco-lattice/model/index.ts` exports `buildDecoLattice`, `specsToLayerPaths`, `isOctilinear`, `buildNineSlice`, `planBand`, `LAYER_TONES`, `toneForLayer`, `brassAngleFor`, the presets and their types. The main barrel does `export * from './model'` plus the components and hooks.
  - `premiere/model/index.ts` exports the model types and the data constants (`DEFAULT_HERO_TITLE`, `SEQUENCE_CHAPTERS`, `TOTAL_SEQUENCE_DURATION`). The main barrel re-exports it.
  - Entries import only `./` modules, `@/shared`, and `import type` from other barrels.
- [ ] 5.2 **Fix the importers.**
  - `art-deco-frame/engine/frameGrammar/{latticeSource,edgeBorder}.ts` → `@/features/deco-lattice/model`. Today `latticeSource.ts:1` imports the full barrel while its comment claims purity; fix both together.
  - `title-customizer/*` (`data/titlePresets`, `hooks/useTitleDraft`, `model/normalizeHeroTitle`, `components/{CustomTitleModal,TitleForm}`) → `@/features/premiere/model`.
  - `frame-studio/data/frameDesigns.ts` uses a relative `../../art-deco-frame`; switch to `@/features/art-deco-frame`.
- [ ] 5.3 **Premiere runtime exports.** Add `PremiereCanvas`, `type PremiereStoreApi` and `type PlaybackTelemetry` to the `premiere` barrel. `app/components/CinematicStage.tsx` imports them from there (it uses deep paths at `:3-5`).
- [ ] 5.4 **RED then GREEN**: new `src/featureBoundaries.test.ts` over non-test source files (skip `*.test.*` and `/testing/`):
  - Allowed import specifiers are `@/features/<f>` and `@/features/<f>/model` (the file must exist). Relative specifiers that leave a feature directory are resolved and checked the same way.
  - Dependency table `ALLOWED_FEATURE_DEPS`; any undeclared edge fails:
    - `app` → all
    - `art-deco-frame` → deco-lattice
    - `avatar-studio` → background-removal, enamel-backdrop, face-detection, gilded-portrait
    - `event-night` → deco-lattice, gilded-ui, lucky-draw, spectacle, spectacle-preview
    - `frame-studio` → art-deco-frame
    - `lucky-draw` → deco-lattice
    - `premiere` → art-deco-frame
    - `spectacle-preview` → spectacle
    - `title-customizer` → premiere
    - all others → none
  - `shared/**` imports no feature, and `features/**` imports nothing from `app/`.
  - `model/index.ts` entries import neither `react` nor `three` nor `@react-three`.
  - A `KNOWN_EXCEPTIONS` list exists for anything not yet migrated: each row has a reason, and it may only shrink. The target is empty.
- [ ] 5.5 `premiere/model/types.ts` and `premiere/scene/sceneApi.ts`: use `import type … from '@/features/art-deco-frame'` (type-only).
- [ ] 5.6 Docs: `docs/ARCHITECTURE.md` (the `model` entry, the dependency table, premiere/frame-studio ownership and spectacle-preview scope as they now are), CLAUDE.md §6 ("through a feature barrel **or its `model` entry**"). Addendum 041 + register row. Gate.

## [ ] Phase 6 — Finding 6 (Minor, optional): one source of truth for premiere state
Do this when the next premiere setting is added, or drop it. It is the largest change and the one with HUD re-render risk.

- [ ] 6.1 Inventory and record which store fields are mirrored by React state: `currentTime`, `isPlaying`, `activeChapterIndex` (as `activeAct`), `cameraMode`, `isNitrateForced` (as `nitrateMode`), `heroConfig`. `soundOn` is audio-only and stays in React.
- [ ] 6.2 **Remove `managerRef`.**
  - `usePremiereRuntime` builds `sceneApi = storeSceneApi(store)` once. `storeSceneApi` is already stateless, and its `dispose` is a no-op.
  - `useSceneLifecycle` keeps only the audio engine.
  - `usePremiereTransport`, `usePremiereSceneOptions` and `usePremiereController` receive a non-null `scene` instead of `managerRef` (31 uses, and the `?.` guards go with it).
  - Update those hooks' tests.
- [ ] 6.3 **Low-frequency state from the store.**
  - Read `cameraMode`, `isNitrateForced`, `heroConfig`, `activeChapterIndex` and `isPlaying` with `useStore(store, selector)`.
  - Delete the matching `useState` in `usePremiereSettings` and `usePlaybackDisplay`, the `setX` parameters, and the `onChapterChange` plumbing.
  - Transport and option hooks write once, through the scene API.
- [ ] 6.4 **Keep `currentTime` throttled.** `usePlaybackDisplay` keeps the 48 ms telemetry throttle for it, with a comment on why: the store advances every frame and the HUD must not re-render at frame rate. Keep or extend the existing `usePlaybackDisplay` throttle test.
- [ ] 6.5 Addendum 042 + register row. Gate, plus a local browser check of the timeline scrub, camera toggle, nitrate toggle and title edit.

## Phase 7 — Close-out
- [ ] 7.1 Run the code-reviewer over the full diff and fix CRITICAL and HIGH findings.
- [ ] 7.2 Re-run the modularity review's greps (duplicate clamps, `1925`, deep imports, `frame-studio` in `premiere`, `@/features/` in the four image features). Record the result in the checklist file.
- [ ] 7.3 Tick the checklist file and report what was deferred (the vocabulary grouping, and Phase 6 if dropped).
- [ ] 7.4 Browser caveat: type-checks, tests pass, builds; visual verification pending until `npm run e2e` is run on darwin.

## Critical files
- Phase 1: `art-deco-frame/engine/frameGrammar/{styleRules(new),generative,latticeSource,index}.ts`, `premiere/scene/styleClamp.ts`, `premiere/scene3d/premiereStore.ts`, `frame-studio/model/{studioFormula,studioActions}.ts`
- Phase 2: `shared/lib/raster/blur.ts` (new), `shared/lib/gold/` (new), `gilded-portrait/{tone,types,export,index}.ts`
- Phase 3: `premiere/hooks/usePremiereController.ts`, `premiere/scene/sceneApi.ts`, `app/components/PremiereSurfaces.tsx`
- Phase 4: `shared/lib/random.ts`, `spectacle/model/winnerCelebration.ts` (new), `spectacle-preview/{components/SpectaclePreviewPanel,hooks/useSpectaclePreview,index}`, `event-night/{components/EventNightStage,hooks/useEventNight}`
- Phase 5: `src/featureBoundaries.test.ts` (new), `deco-lattice/model/index.ts` (new), `premiere/model/index.ts` (new), `title-customizer/*`, `app/components/CinematicStage.tsx`
- Phase 6: `premiere/hooks/use{PremiereRuntime,SceneLifecycle,PremiereTransport,PremiereSceneOptions,PlaybackDisplay,PremiereSettings}.ts`

## Verification
- Per phase: the gate above. Phase 1 adds `npx vitest run src/features/art-deco-frame src/features/premiere src/features/frame-studio`. Phase 5 adds `npx vitest run src/featureBoundaries.test.ts src/barrels.test.ts src/addenda.test.ts src/discipline.test.ts`.
- End: all greps in 7.2 clean, `disciplineBaseline` not larger than at 0.2, coverage still 100 %.
- Not verifiable here: rendering, HUD behaviour and the likeness screenshots. Those need `npm run e2e` locally (darwin baselines only).
