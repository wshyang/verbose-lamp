# ADDENDUM-022 — Testability refactor: likeness gate, pure choreography, React Three Fiber port (assessment and plan)

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §2 (stack), §7, §9; CLAUDE.md §2, §3, §5, §6, §7. Un-defers the Playwright item in ADDENDUM-001 §3. Leaves ADDENDUM-014's module map intact apart from `features/premiere` internals.
**Status:** Accepted (plan). Not implemented. Each phase gets its own implementation addendum, numbered with the next free number.
**Audience:** the implementing agent. Read §1–§3 before writing code. Phases are strictly ordered, and each phase is one commit or more.

## 0. First step for the implementer

1. Read `src/features/premiere/scene/GatsbySceneManager.ts` in full, plus `decoCards.ts`, `responsiveLayout.ts`, and
   `src/features/premiere/hooks/*.ts`.
2. Create branch `refactor/testability-phase-0` from `main`.
3. Phase 0 must finish, **and the user must capture screenshot baselines (step 0.6)**, before any Phase 1 code is written.

## 1. Context — the question and the answer

The user asked: is the frontend purely WebGL with no DOM, how do we improve testability, and could the work and
effects be structured around a well-maintained framework while keeping today's visual likeness?

**It is not purely WebGL.** It is a hybrid of three rendering styles:

| Layer | Where | Rendered by | Tested today |
|---|---|---|---|
| HUD and dialogs | `src/app/components/*`, `features/{frame-studio,title-customizer,research,qr-generator,avatar-studio,gilded-portrait}/components`, `shared/ui` | React DOM + Tailwind | No |
| Title sequence | `features/premiere/scene/GatsbySceneManager.ts` (767 LOC) + `decoCards.ts`, `environment.ts`, `art-deco-frame/render/*` | Imperative Three.js r186 inside one `<canvas>` | Pure geometry only |
| 2D artefacts | QR (`GoldenQrCode.tsx`, SVG), avatar and portrait (`ShimmerCanvas.tsx`, CPU RGBA pipelines) | SVG / Canvas 2D | Pure pipelines, yes |

How the canvas is mounted: `CinematicStage` renders an empty `<div ref>`. `usePremiereRuntime` creates
`new GatsbySceneManager(div)`. The manager appends `renderer.domElement`, owns its own RAF loop, its window listeners,
the camera, five card rigs, the atmosphere (wall, searchlights, green light, 950-point dust), three moving point lights,
`ScreenBorderRig`, `OrbitControls`, and `EffectComposer` (RenderPass → `UnrealBloomPass(0.56, 0.64, 0.78)` → inline
`CinemaNitrateShader` → OutputPass). React reaches it only through `managerRef.current.<method>()`.

## 2. Testability gaps (ranked)

1. **The choreography is untested.** All timing math sits inline in `animate()` (lines 577–741): card
   draw, text, part and fade windows; the camera Z path (hold 0–0.78, fly 0.78–1.0, finale ease); green-light intensity and Z;
   the nitrate curve; searchlight sway; light-rig orbits. This is the code most likely to break in a refactor.
2. **Frames are non-deterministic.** Dust uses `Math.random()` (lines 362–366). `THREE.Clock` drives grain, shimmer,
   sway and the pointer camera. There is no way to say "render frame t", so no pixel baseline is possible.
3. **There is no likeness gate.** Without screenshots, "preserve the visual likeness" can't be verified.
4. **There are no DOM tests.** `vitest.config.ts` uses `environment: 'node'` and `include: ['src/**/*.test.ts']`.
5. **The scene graph is opaque.** The class's private fields can't be inspected without a GPU.
6. **The scene API is untyped.** Hooks depend on the concrete `GatsbySceneManager` class, not on an interface. This
   goes against CLAUDE.md §5 ("the scene manager exposes a typed API").

## 3. Research — libraries considered

Sources: npm registry metadata (fetched 2026-10-25), pmndrs release and docs pages, and playwright.dev / vitest.dev docs.
General web search was unavailable (the Bedrock proxy rejects the tool).

| Library | Version, date | Peer fit with ours (react 19.2.6, three 0.186.1, vitest 4.1) | Decision |
|---|---|---|---|
| `@react-three/fiber` | 9.8.2, 2026-10-14 | react `>=19 <19.4`, three `>=0.156` ✓ | **Adopt (Phase 2).** A declarative scene graph made of React components; `useFrame`; React owns the lifecycle |
| `@react-three/drei` | 10.7.9, 2026-09-25 | fiber `^9` ✓ | **Adopt, OrbitControls only.** Same three-stdlib controls, so orbit feel is unchanged |
| `@react-three/test-renderer` | 9.1.1, 2026-07-31 | fiber `>=9` ✓ | **Adopt (Phase 3).** Runs the scene in node with no GPU: `advanceFrames`, scene-graph and uniform assertions |
| `zustand` | 5.0.16, 2026-10-22 | already a fiber dependency | **Adopt (Phase 2).** A vanilla store gives transient per-frame reads and a testable state machine |
| `@playwright/test` | 1.64.1, 2026-10-14 | — | **Adopt (Phase 0).** `toHaveScreenshot` is the likeness gate; flow tests drive the HUD |
| `jsdom` 30.1.3, `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.8, `vitest-canvas-mock` 1.2.0 | 2026-08/10 | vitest 4 ✓ | **Adopt (Phase 1).** DOM tests, and canvas-2D stubs for the texture builders |
| `@react-three/postprocessing` 3.2.2 / `postprocessing` 6.39.5 | 2026-10 / 09 | three `<0.187` ✓ | **Defer.** Its bloom (mipmap blur) is a different algorithm from `UnrealBloomPass` and would visibly change the glow. Re-evaluate only behind the gate (§8) |
| R3F v10 (alpha 6) | pre-release | WebGPU default | **Reject now.** It's alpha and changes the renderer |
| Theatre.js `@theatre/core` | 0.7.2, 2024-05-19 | — | **Reject.** No release in 2.5 years |
| GSAP 3.15 | 2026-04 | — | **Not needed.** Our timing is closed-form math, and pure tested functions are better than a tween runtime |
| Vitest browser mode (`@vitest/browser-playwright` 5.0.5) | needs vitest 5 | ✗ on vitest 4 | **Defer.** Playwright covers real-browser needs |

**Likeness principle:** keep every shader, texture builder, geometry builder, light value and the three.js
`EffectComposer` chain byte-for-byte. The framework changes who *owns* the objects, not what they *are*.

## 4. Phase 0 — Likeness gate (no visual change; old renderer)

Branch `refactor/testability-phase-0`. Commit after each numbered step.

**0.1 Seeded PRNG.** New `src/shared/lib/prng.ts`: `createPrng(seed: number): () => number` (mulberry32), plus
`prng.test.ts` covering the first 5 values for seed 1920, range `[0,1)`, and that two instances give the same sequence. Export
it from `src/shared/lib` (add an `index.ts` barrel if one is missing). In `GatsbySceneManager.buildAtmosphericWorld`, replace the
five `Math.random()` calls with `const random = createPrng(DUST_SEED)` where `DUST_SEED = 1920` is a named constant. The look is
statistically unchanged: positions were already random on every load; now they are fixed.

**0.2 Freeze hook.** New `src/features/premiere/model/freeze.ts`: `parseFreezeAt(search: string): number | null`
(it accepts `?freezeAt=<seconds>` with 0 ≤ value < `TOTAL_SEQUENCE_DURATION` and returns null otherwise), plus `freeze.test.ts`.
Add an optional `freezeAt?: number` to the manager's constructor callbacks object, renamed to `options`
(`GatsbySceneManagerOptions`). When it is set:
- `currentTime = freezeAt`, `isPlaying = false`, and `animate()` uses `elapsed = freezeAt` and `dt = 0` instead of the clock;
- `handlePointerMove` ignores events (pointer aim stays at 0, 0);
- after 3 rendered frames, set `container.dataset.frameReady = 'true'`.
`usePremiereRuntime` passes `parseFreezeAt(window.location.search)`. Users never see this. A plain visit
without the param behaves exactly as before.

**0.3 Typed scene port.** New `src/features/premiere/scene/sceneApi.ts`: `export interface PremiereSceneApi` with
the manager's public methods (`updateHeroTitle, jumpToChapter, setTime, setPlaying, togglePlaying, setCameraMode,
setNitrateMode` + `FrameStudioTarget`'s three methods). `GatsbySceneManager implements PremiereSceneApi`. Retype
`managerRef` in `usePremiereController`, `usePremiereRuntime`, `usePremiereTransport` and `usePremiereSceneOptions` as
`MutableRefObject<PremiereSceneApi | null>`. This step is type-only.

**0.4 Testids for the e2e targets.** Add `data-testid="cinematic-stage__canvas"` to the mount div in
`CinematicStage.tsx`. Make sure every control the flows in 0.5 touch has a testid (verify by reading each file; current
ones include `timeline__chapter`, `timeline__play-toggle`, `timeline__replay`, `timeline__scrubber`). Add any that are
missing in the `{component-kebab}__{element-role}` form.

**0.5 Playwright.** `npm i -D @playwright/test@1.64.1`. Add scripts `"e2e": "playwright test"` and
`"e2e:update": "playwright test --update-snapshots"`. Add `/test-results/`, `/playwright-report/` and `/blob-report/` to
`.gitignore`; snapshots **are** committed. New `playwright.config.ts` (repo root; `tsconfig` include stays
`src` + vite config, so add `"playwright.config.ts", "e2e"` to `include`):
- `testDir: 'e2e'`, `webServer: { command: 'npm run dev -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true }`;
- `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' }`;
- `use.launchOptions.args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']`;
- projects: `desktop-chromium` (1440×900) and `mobile-chromium` (390×844, `hasTouch: true`, `isMobile: true`, Chromium engine,
  so `hasCoarsePointer` takes the mobile auto-level path).

`e2e/support/stage.ts`: `gotoFrozen(page, seconds, opts?: { hud?: boolean; nitrate?: boolean; orbit?: boolean })`
navigates to `/?freezeAt=s`, waits for `[data-testid="cinematic-stage__canvas"][data-frame-ready="true"]`, and toggles the
HUD (`h`), nitrate, or orbit (`o`) as asked.

`e2e/likeness.spec.ts` (HUD hidden, full page), with names that are stable snapshot keys:

| Shot | freezeAt | Why |
|---|---|---|
| `act1-nitrate-opening` | 1.00 | silver-nitrate opening + green light |
| `act1-monogram-hold` | 4.32 | GG gate hold |
| `act1-fly-through` | 6.70 | gate parting / fly-through portal |
| `act2-hold` | 11.28 | 0.6 of act II |
| `act3-hold` | 18.08 | |
| `act4-hold` | 24.82 | |
| `act5-hero-hold` | 33.80 | hero card, crown rays |
| `act5-finale-bookend` | 37.00 | green-light bookend + finale fade |
| `act5-nitrate-forced` | 33.80, nitrate on | forced filter |
| `act5-orbit` | 33.80, orbit on | orbit camera pose |
| `act5-screen-border` | 33.80, border on via Frame Studio | camera-parented proscenium |
| `hud-overlay` | 11.28, HUD shown | DOM over canvas composition |

`e2e/flows.spec.ts` (not frozen): play/pause toggles the label; each `timeline__chapter` click moves the clock into that
act; scrubber input changes the time readout; `h` hides the HUD; each modal opens and closes through its testid, and
Escape closes it; applying a custom title jumps to act V.

**0.6 USER CHECKPOINT — capture baselines.** The sandbox has no browser. The user runs
`npx playwright install chromium && npm run e2e:update`, inspects `e2e/*-snapshots/`, and commits them. Baselines are
OS-suffixed (`-darwin`) by Playwright. Comparisons are only valid on the same OS, browser and version.

**0.7 Extract choreography** (verbatim move, no new behaviour). New `src/features/premiere/scene/choreography.ts`,
each function ≤ 20 lines, no `three` import (local `smoothstep` identical to `THREE.MathUtils.smoothstep`):
- `activeChapterIndex(t, chapters): number`
- `cardPhase(localT, isFinale): CardPhase`, where `CardPhase = { drawProgress, textProgress, partOpen, opacity }`, all 0 outside `[-0.18, 1.18]`
- `cinemaCameraZ({ chapters, activeIdx, chapterLocal, pullback }): number` (hold, fly and finale branches as separate private functions)
- `greenLight(t, heroZ): { intensity, z }`
- `openingNitrate(t): number` and the constant `FORCED_NITRATE = 0.92` (no boolean flag parameter, per CLAUDE.md §6)
- `searchlightSway(elapsed): { left, right }`
- `lightRig(elapsed, focusZ): { key, rim, cool }` as `[x, y, z]` tuples
- `rigAnchors({ cameraMode, cameraZ, chapterZ }): { backdropZ, lightZ }`

`choreography.test.ts`: `smoothstep` parity with `THREE.MathUtils.smoothstep` across 50 samples; boundaries (card
invisible at localT −0.2 and 1.2; finale `partOpen` always 0; nitrate 0.82 at t=0 and 0 after 2.55; the act-index
handover at each `startTime`); a **golden snapshot** of every function sampled every 0.25 s over 0…38 s. Then rewrite
`animate()` to call these functions. `npm run e2e` must pass against the 0.6 baselines (user runs it).

**0.8 Addendum.** Write the Phase 0 implementation addendum. Update the ADDENDUM-001 §3 row "Playwright e2e" to
"Un-deferred by ADDENDUM-022". Validation line goes in every commit.

## 5. Phase 1 — DOM unit tests (old renderer)

**1.1** `npm i -D jsdom@30 @testing-library/react@16 @testing-library/dom@10 @testing-library/user-event@14 vitest-canvas-mock@1`.
`vitest.config.ts`: `include: ['src/**/*.test.{ts,tsx}']`. Keep `environment: 'node'` as the default. DOM test files start with
`// @vitest-environment jsdom`. Add `src/test/setupDom.ts` (it calls RTL `cleanup()` in `afterEach`, and does nothing when
`typeof document === 'undefined'`), registered through `setupFiles`. Assertions use plain `expect`; `jest-dom` is not added. `vite.config.ts` stays untouched.

**1.2** Component tests beside each component (`Foo.tsx` + `Foo.test.tsx`), using domain fixtures (`SEQUENCE_CHAPTERS`,
`DEFAULT_HERO_TITLE`):
- `PremiereTimeline.test.tsx`: renders 5 chapter buttons labelled `I. monogram` … `V. GATSBY`; the active one has the selected
  variant; the play-toggle label follows `isPlaying`; scrubbing calls `onScrub(Number)`; the hero label follows `heroConfig.mainTitle`.
- `PremiereHeader.test.tsx`: every toggle calls its handler; `aria-pressed` / label reflect state.
- `FrameStudioControl.test.tsx`: changing the surface swaps panels; detail presets call their handlers; the close/collapse testids work.
- `CustomTitleModal.test.tsx`: editing fields and applying passes a config normalised by `normalizeHeroTitle`; Escape closes.
- `testid-coverage.test.tsx`: render `GatsbyPremiere` with `usePremiereController` mocked (`vi.mock`) and assert that
  every `button, input, select, textarea` in the document has a `data-testid`. This turns the CLAUDE.md §5 rule into a test.
  Fix every failure it finds.

**1.3** Implementation addendum + commit.

## 6. Phase 2 — React Three Fiber port, 1:1 (new renderer)

Branch `refactor/r3f-port`. `npm i @react-three/fiber@9.8.2 @react-three/drei@10.7.9 zustand@5`.
New folder `src/features/premiere/scene3d/`. One concern per file; every file under 200 LOC; components render, hooks decide.

**2.1 Store** `premiereStore.ts`: `createPremiereStore()` (zustand `createStore`, vanilla) holding
`{ currentTime, isPlaying, cameraMode, isNitrateForced, heroConfig, frameStyle, borderStyle, isBorderEnabled, freezeAt }`.
Its actions reuse the clamping code currently in `setSequenceFrameStyle` / `setScreenBorderStyle` / `setTime` /
`jumpToChapter` (moved into the pure `scene/styleClamp.ts` with tests). `storeSceneApi(store): PremiereSceneApi` is an
adapter, so `usePremiereTransport`, `usePremiereSceneOptions` and `useFrameStudio` **do not change**. `premiereStore.test.ts`
covers every action, clamping, `jumpToChapter` (+0.15 s), and `togglePlaying` return values.

**2.2 Canvas** `PremiereCanvas.tsx`, matching the current renderer exactly:
`<Canvas dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
camera={{ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] }} onCreated={applyRendererLook}>`.
`applyRendererLook` sets `ACESFilmicToneMapping`, `toneMappingExposure = 1.18`, `scene.background = #050407`,
`scene.fog = FogExp2(#050407, 0.022)`, and **`scene.add(camera)`** (R3F's default camera is not in the scene, but the screen
border is parented to it). Keep R3F's default colour management, which matches three r186 defaults; verify with the gate.

**2.3 Components** (each wraps an existing builder; nothing is re-authored):
- `PlaybackClock.tsx`: one `useFrame(…, -1)` advances `currentTime` (dt capped at 0.05, wraps at 38 s), honours `freezeAt`,
  and fires `onChapterChange` / throttled `onTelemetry` (48 ms, moved from `usePremiereController`) and `frameReady` after 3 frames.
- `TitleCard.tsx`: `useMemo(() => createGatsbyCardRig(chapter, …))` → `<primitive object={rig.root} />`; `useFrame` →
  `rig.updateState({ ...cardPhase(localT, isFinale), time: elapsed })`; a frame-style subscription → `rig.setFrameStyle`
  (coalesced to one per frame, as `scheduleFrameRebuild` does today); `useEffect` cleanup → `rig.dispose()`. The hero card is
  keyed by `JSON.stringify(heroConfig)`, which replaces `updateHeroTitle`'s manual remove/rebuild.
- `Atmosphere.tsx` → `DecoWall.tsx` (`createDecoWallpaperTextures`, material values copied), `Searchlights.tsx`
  (beam canvas texture moved verbatim to `scene/searchlightTexture.ts`), `GreenLight.tsx`, `GoldDust.tsx` (`createPrng(DUST_SEED)`).
  The GLSL is already in `.vert` / `.frag` files under `premiere/scene/shaders/` (ADDENDUM-025/026); the R3F
  components import those files and the uniform factories from that barrel instead of creating `*.glsl.ts` copies.
- `LightingRig.tsx`: ambient `#ffe8b3` 0.35 + the three point lights; positions from `lightRig()`.
- `BallroomEnvironment.tsx`: `useThree(gl)` → `createBallroomEnvironment(gl)` → `scene.environment`; disposed on unmount.
- `CinemaCamera.tsx`: in cinema mode, `cinemaCameraZ` + `getCinemaCameraPose`. Orbit mode uses drei `<OrbitControls enableDamping
  dampingFactor={0.06} minDistance={3.2} maxDistance={26} />` and the existing `focusOrbitOnChapter` logic, moved into
  `scene/orbitFocus.ts` (pure + test). Pointer aim comes from a window `pointermove` listener in a hook (`usePointerAim`),
  exactly as now.
- `ScreenBorder.tsx`: `createScreenBorderRig(camera, style, aspect)`, with `setViewport` on `useThree(size)` changes.
- `CinemaComposer.tsx`: **keeps three's `EffectComposer` + `RenderPass` + `UnrealBloomPass(res, 0.56, 0.64, 0.78)` +
  `ShaderPass(CinemaNitrateShader)` + `OutputPass`.** Built in `useMemo`, resized from `useThree(size)`, and rendered in
  `useFrame(() => composer.render(), 1)`. A positive priority disables R3F's own render, so there is a single render path, as today.
- `PremiereScene.tsx` composes the above. `ResponsiveFit` reads `resolveViewportFit(size, hasCoarsePointer)` and passes
  `cardScale` / `cameraPullback` down.

**2.4 Wiring.** `CinematicStage` renders `<PremiereCanvas store={…} />` inside the existing div (it keeps
`data-testid="cinematic-stage__canvas"`, `aria-label`, and cursor classes). `usePremiereRuntime` keeps only `CinemaAudioEngine`
and creates the store. `usePremiereController` exposes `storeSceneApi(store)` as the `managerRef` target.

**2.5 Gate, then delete.** The user runs `npm run e2e`. Every Phase 0 shot must pass **unchanged baselines** (no
`--update-snapshots`). On a failure, fix the port; never re-baseline. Once it is green, delete `GatsbySceneManager.ts`.
Update `docs/ARCHITECTURE.md` (`features/premiere` = sequence domain + store + R3F scene; `scene/` = pure +
builders, `scene3d/` = components). Write the implementation addendum and record the bundle-size delta from `npm run build`
(single-file output).

## 7. Phase 3 — Scene tests without a GPU

`npm i -D @react-three/test-renderer@9.1.1`. Files are `*.test.tsx` with `// @vitest-environment jsdom` + `vitest-canvas-mock`
(the card and wall builders draw on Canvas 2D):
- `TitleCard.test.tsx`: at `advanceFrames` to t = 4.32, the frame material's `uDraw/uPartOpen/uOpacity` equal `cardPhase(...)`;
  at localT 1.2, `root.visible === false`; on unmount, `dispose` spies are called once each.
- `PremiereScene.test.tsx` (without `BallroomEnvironment` and `CinemaComposer`, which need real GL): 5 card roots exist at the
  chapter z-positions; changing `heroConfig` replaces exactly one root; two frame-style changes inside one frame → one geometry rebuild;
  the screen border is visible only when `isBorderEnabled`.
- `PlaybackClock.test.tsx`: frozen time doesn't advance; normal time wraps at 38 s; `onChapterChange` fires once per handover.

## 8. Phase 4 — Optional (each item only if it passes the unchanged gate)

- An A/B of `@react-three/postprocessing` `<Bloom>` vs `UnrealBloomPass`: adopt only with zero screenshot failures.
- drei helpers (e.g. `<Points>`), only where they replace hand code with identical output.
- Same treatment for `features/avatar-studio` previews: Playwright shots of the cut-out/gilding output from fixed sample photos.

## 9. Impact and what a future reader must know

- **The visual contract is the Phase 0 screenshot set.** Re-baselining (`e2e:update`) needs its own addendum explaining the
  intended visual change.
- Shaders, texture builders, frame grammar, materials and composer passes are **reused, not rewritten**. Any change to
  them is a visual change and falls under the rule above.
- `?freezeAt=` is a test affordance, harmless in production (it pauses on one frame). Keep it.
- Bundle size goes up by roughly the fiber + drei-controls + zustand code. Record the measured figure in the Phase 2 addendum.
- Files that must not grow: `GatsbySceneManager.ts` (it is deleted in Phase 2). New files stay under 200 LOC.

## 10. Verification per phase

| Phase | Sandbox (agent) | Browser (user) |
|---|---|---|
| 0 | `npx tsc --noEmit`, `npm test` (prng, freeze, choreography snapshot), `npm run build` | 0.6 capture baselines; after 0.7, `npm run e2e` green |
| 1 | same + new DOM tests | `npm run e2e` green (no visual change expected) |
| 2 | same + store/clamp/orbitFocus tests | `npm run e2e` green **against Phase 0 baselines**; manual side-by-side `npm run dev` vs `main`: all acts, orbit, nitrate, Frame Studio edits, mobile emulation |
| 3 | same + test-renderer suites | — |

Commit validation line: `Validation: tsc ✓ vitest ✓ build ✓ — browser not available in sandbox; e2e run by user: <result>`.
