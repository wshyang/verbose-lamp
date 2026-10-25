# ADDENDUM-027 — R3F testability refactor, Phases 2–3: the port, and the scene tests that replaced the manager

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (the plan this completes), ADDENDUM-026 (Phase 0), ADDENDUM-025 (100% coverage gate), CLAUDE.md §1, §2, §3, §5, §7.
**Status:** Phases 2 and 3 implemented. The likeness gate was **not** run before the old manager was deleted — see §7, which is the one thing a reader must not skim.

## 1. What was decided

ADDENDUM-022 §6 and §7 are implemented. `GatsbySceneManager.ts` (721 lines of imperative Three.js host) and its 510-line test are **deleted**. The premiere is now a React Three Fiber tree over the same builders, the same shaders and the same post-processing chain, driven by a vanilla zustand store.

| Layer | File(s) | Role |
|---|---|---|
| State | `scene3d/premiereStore.ts` (161) | `createPremiereStore()` + `storeSceneApi(store)`, the `PremiereSceneApi` adapter the existing hooks already spoke |
| Pure | `scene/styleClamp.ts` (49), `scene/orbitFocus.ts` (45), `scene/searchlightTexture.ts` (33) | clamping, orbit framing, the beam texture — moved out of the manager verbatim |
| Pure | `scene/choreography.ts` (208, from ADDENDUM-026) | timing/staging math; unchanged by this phase |
| Shaders | `scene3d/shaders/{cinemaNitrate,goldDust,greenLight}.ts` | GLSL moved verbatim, no edits |
| GPU | `scene3d/composer.ts` (64) | three's EffectComposer chain: RenderPass → UnrealBloomPass(0.56, 0.64, 0.78) → nitrate ShaderPass → OutputPass |
| Components | `scene3d/*.tsx` (10 files, 50–97 lines each) | `PremiereCanvas`, `PremiereScene`, `PlaybackClock`, `TitleCard`, `DecoWall`, `Searchlights`, `GreenLight`, `GoldDust`, `LightingRig`, `BallroomEnvironment`, `CinemaCamera`, `ScreenBorder`, `CinemaComposer` |
| Wiring | `app/components/CinematicStage.tsx`, `hooks/usePremiereRuntime.ts`, `hooks/usePremiereController.ts` | stage renders `<PremiereCanvas store>`; runtime creates the store and owns only `CinemaAudioEngine` |

Every builder is a direct call into the existing code: `createGatsbyCardRig`, `createBallroomEnvironment`, `createDecoWallpaperTextures`, `createScreenBorderRig`, `createExtrudedDecoTextMesh`, `resolveViewportFit`, `getCinemaCameraPose`, `smoothstep`-family choreography. Nothing was re-authored, which is what made a 1:1 port feasible without a browser.

## 2. Why

The old manager owned the renderer, the clock, the cards, the atmosphere, the camera, the composer and mouse aim in one 721-line class whose only test was a wall of `vi.mock`ed three internals. It could not be inspected, could not be reasoned about frame by frame, and — because it appended its own canvas — could not be tested for anything except "did it call the right methods". ADDENDUM-022's argument is that React owns the scene graph, a store owns the state, and pure modules own the maths; then every piece is testable in node, and the app has one rendering road instead of two. This phase is that change.

## 3. Relation to the base spec and earlier addenda

- BUILD_PROMPT §2 (stack): two runtime dependencies added — `@react-three/fiber@9.8.2`, `zustand@5`. `@react-three/drei` was installed per the plan and then **removed** (§5.1). One dev dependency added: `@react-three/test-renderer@9.1.1`. `three` stays at 0.186.1 and remains the only renderer.
- CLAUDE.md §2: the "rendering code is kept thin" rule now has teeth — the DOM/scene suites assert uniforms, positions and call counts, never pixels.
- ADDENDUM-025's 100% coverage gate is unchanged and still green: the port added 1,425 functions and 2175 branches, all covered.
- ADDENDUM-014's module map is intact apart from `features/premiere` internals, exactly as ADDENDUM-022 §2 promised.

## 4. What was built

### 4.1 Store and port

`createPremiereStore()` returns a vanilla zustand store holding `currentTime`, `isPlaying`, `cameraMode`, `isNitrateForced`, `heroConfig`, `frameStyle`, `screenBorderStyle`, `isBorderEnabled`, `freezeAt`, the three wiring callbacks, and the actions. The actions reuse the clamping now in `styleClamp.ts`, so the store and the old manager agree on every bound.

`storeSceneApi(store)` maps the store onto `PremiereSceneApi`, so `usePremiereTransport`, `usePremiereSceneOptions` and `useFrameStudio` are untouched. `dispose()` stops playback instead of tearing down a renderer, which is all the port can honestly do.

### 4.2 Components

- `PlaybackClock` — `useFrame(…, -1)`: advances `currentTime` (Δ capped at 0.05 s, wraps at 38 s), honours `freezeAt`, fires `onChapterChange` on hand-over, `onTelemetry` every frame, and `onFrameReady` on the third frame.
- `TitleCard` — one rig per act, `<primitive object={rig.root} />`; `cardPhase()` applied every frame; frame-style edits coalesced to one `setFrameStyle` per frame (the old `scheduleFrameRebuild`); the hero card is keyed by `JSON.stringify(heroConfig)`, which replaces `updateHeroTitle`'s manual remove/rebuild; `dispose()` on unmount.
- `DecoWall`, `Searchlights`, `GreenLight`, `GoldDust`, `LightingRig` — the atmosphere, anchored with `rigAnchors()` and animated with `searchlightSway()` / `lightRig()` / `greenLight()`. Textures and geometries are disposed on unmount.
- `BallroomEnvironment` — `createBallroomEnvironment(gl)` into `scene.environment`, cleared and disposed on unmount.
- `CinemaCamera` — `CinemaDolly` reproduces `cinemaCameraZ()` + `getCinemaCameraPose()` + pointer aim; `OrbitCamera` drives three's `OrbitControls` (damping 0.06, 3.2–26) from `planOrbitFocus()` and steps it every frame, because damping only settles when it is updated.
- `ScreenBorder` — `createScreenBorderRig(camera, style, aspect)`, style/enabled/viewport on change, `update()` per frame, disposed on unmount.
- `CinemaComposer` — `createCinemaComposer()` in a memo, resized from `useThree(size)`, rendered in `useFrame(…, 1)` so R3F's own render is off and there is a single render path, exactly as before.
- `PremiereCanvas` — the `<Canvas>` with `dpr={[1, 2]}`, `gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}`, `camera={{ fov: 42, near: 0.1, far: 180, position: [0, 0, 10.5] }}`, and `applyRendererLook` (ACES 1.18, `#050407` background, `FogExp2(0.022)`, **camera added to the scene** so the poster border renders).
- `PremiereScene` — the composition. It deliberately **excludes** `BallroomEnvironment` and `CinemaComposer`, which need a real GL context; `PremiereCanvas` adds them around it. That split is what lets the whole scene render in `@react-three/test-renderer`.

### 4.3 Wiring

`usePremiereRuntime` now creates the store (seeded with `parseFreezeAt(window.location.search)` and the callbacks), keeps `CinemaAudioEngine`, and installs `storeSceneApi(store)` as the `managerRef` target. `onFrameReady` writes `data-frame-ready="true"` on the mount div — the same signal the Playwright gate waits on. `CinematicStage` renders `<PremiereCanvas store hasCoarsePointer={detectCoarsePointer()} />` inside the testid'd div, and `usePremiereController` returns the store alongside `stageRef`.

## 5. Deviations from ADDENDUM-022

| Plan | Delivered | Why |
|---|---|---|
| `@react-three/drei@10.7.9` for `<OrbitControls>` | three's own `examples/jsm/controls/OrbitControls.js`; drei uninstalled | drei was the same three-stdlib control behind a wrapper. Measured bundle change from dropping it was under 1 kB after tree-shaking, and three's control is the one the old manager used, so the port stays 1:1. One dependency less to track. |
| `CinemaComposer` and `BallroomEnvironment` inside `PremiereScene`; tests render "without" them | `PremiereScene` contains neither; `PremiereCanvas` composes them | A boolean prop to skip them would be test-only branching in production code. Splitting the composition is honest and lets the scene suite run without GL. |
| Null guards on every `useRef` in frame callbacks | `useRef<T>(null!)` (the R3F idiom) | R3F attaches refs during commit, before the first frame, so the guards are unreachable — and an unreachable branch either needs a `v8 ignore` or breaks the 100% gate. Removing a dead branch is better than excusing it. The refs are still real refs; only the type says otherwise. |
| Store `jumpToChapter` reuses `planOrbitFocus()` and checks `seekTime !== null` | In orbit mode it lands directly on the hold fraction; in cinema mode on `start + 0.15 s` | The entry time is always at the very start of an act, so the "already inside the hold" branch was unreachable from this action. `planOrbitFocus()` is still the single definition of the hold, and `setCameraMode('orbit')` keeps the branch that *is* reachable. |
| Telemetry throttle "moved into `PlaybackClock`" | `PlaybackClock` emits every frame; the 48 ms throttle stays in `usePremiereController` | Moving it would have changed `onTelemetry`'s contract (rate and meaning) for no gain. The old manager also emitted every frame. |
| `e2e/support/stage.ts` waits on the canvas only | unchanged from ADDENDUM-026 | `onFrameReady` now comes from R3F's third frame instead of the manager's, but the selector and timing are identical. |

### 5.1 Two behaviour-adjacent fixes found by the tests

- **`lucky-draw/render/drumRenderer.ts`** wrote fractional RGB channels into `addColorStop` (`rgba(111.849…,80.689…,…)`). Browsers accept floats, but stricter canvas implementations (and the jsdom canvas stub) reject the string, which surfaced as an unhandled error inside the app suite once the scene started rendering in tests. The three channels are now rounded; the four `drumRenderer.golden` recordings keep their call counts (279/317/453/281) and only their colour-string hashes changed, which is the whole of that snapshot's diff.
- **`usePremiereRuntime`** keeps the store from the first render but must follow the newest `audioRef`; without that, a chapter hand-over after a re-render would miss `triggerActShimmer`. It now reads the current ref through a one-line holder.

## 6. What a future reader must know

- **`@react-three/test-renderer` does not advance `state.clock.elapsedTime`.** `useFrame` runs and receives the delta you pass, but the three clock stays at 0. Suites that need elapsed-time behaviour therefore drive it through `freezeAt` (frozen time is the clock by definition) or assert the *first* frame's value. Do not "fix" a component because its `uTime` looks stuck in a test.
- **R3F copies the `uniforms` prop into the material.** Writing to the object you passed to `<shaderMaterial uniforms={…}>` after mount does not reach the GPU. Keep a `ref` to the material and write `material.current.uniforms.…` — that is why `GreenLight` and `GoldDust` hold material refs.
- The scene is a single render path: `CinemaComposer`'s `useFrame` priority of `1` turns R3F's own render off. Do not add another positive-priority frame callback that renders.
- `data-frame-ready` is set by `PlaybackClock` on frame three via `onFrameReady`; the Playwright suites depend on it.
- `scene/` must stay free of React and `scene3d/` must stay free of business logic. The pure modules are what the golden test pins.

## 7. Validation performed — and the one gap

- `npx tsc --noEmit` → clean, including `playwright.config.ts` and `e2e/`.
- `npm test` → **1,198 tests in 157 files**, all green; statements 6125/6125, branches 2175/2175, functions 1425/1425, lines 5424/5424 — **100% on all four**, thresholds enforced.
- `npm run build` → clean. Single-file bundle **1,734.39 kB, gzip 566.39 kB**, up from 1,328.36 kB / 446.49 kB: **+406 kB raw, +120 kB gzip**, almost entirely `@react-three/fiber` + `react-reconciler` + `zustand`. That is the price of the port and it is recorded here as §9 of the plan required.
- `npx playwright test --list` → 40 tests across the two projects (config and specs still parse and type-check).
- **Not run: the likeness gate.** `npm run e2e` needs Chromium, and this sandbox has neither a browser nor access to the Playwright CDN, so the twelve Phase 0 screenshots have never been compared. The user's explicit instruction was to proceed and accept that it is unverified. Consequence: `GatsbySceneManager.ts` was deleted **without** the visual proof the plan demanded. If the first `npm run e2e` on a machine with a browser shows diffs, the fix is to repair the port — not to re-baseline, which would erase the evidence. The nine shots that pin the acts, plus nitrate/orbit/screen-border/HUD, are the specification of what "the same" means.
- Phase 4 (optional `@react-three/postprocessing` A/B, drei helpers, avatar-studio shots) is **not** attempted: every item is gated on the unchanged likeness gate, which cannot run here.
