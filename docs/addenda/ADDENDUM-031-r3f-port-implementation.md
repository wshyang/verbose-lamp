# ADDENDUM-031 — R3F port implemented (ADDENDUM-022 Phase 2)

Status: implemented. Likeness gate green in sandbox Chromium + SwiftShader —
desktop 12/12 (8.6 m), mobile 12/12 (3.6 m) against the **unchanged** 24
baselines captured from the imperative manager under ADDENDUM-030. No baseline
was recaptured for this port.

## What changed

`GatsbySceneManager` (737 lines) is deleted. The premiere renders through
React Three Fiber behind the untouched `PremiereSceneApi` port:

- **Store (Slice A).** `scene3d/premiereStore.ts` — a vanilla zustand store
  mirroring the manager's fields 1:1, plus `storeSceneApi()` so the
  transport, scene-options and Frame Studio hooks keep calling the same
  methods. One field beyond §2.1's list: `orbitFocusSerial`, bumped by
  chapter jumps and orbit-mode entries — the declarative stand-in for the
  manager's two `focusOrbitOnChapter` call sites. The manager's clamping,
  jump and orbit-hold math moved verbatim to pure `scene/styleClamp.ts`
  and `scene/orbitFocus.ts` first, with the manager rewired onto them
  before its deletion, so no behaviour changed while the scaffolding went in.
- **Components, one concern each.** `PlaybackClock` (priority −1; owns the
  48 ms telemetry throttle moved out of the controller, chapter callbacks,
  the frozen `frameReady` handshake), `CinemaCamera` (drei `OrbitControls`
  mounted only in orbit mode, so an idle `controls.update()` can never
  fight the dolly), `TitleCard` ×5 (hero keyed by billing config; rigs
  created in effects so dispose/detach stay symmetric), `Backdrop`,
  `DecoWall`, `Searchlights`, `GreenLight`, `GoldDust`, `LightingRig`,
  `BallroomEnvironment`, `ScreenBorder`, and `CinemaComposer` (three's own
  EffectComposer driven at frame priority 1 — deliberately not
  @react-three/postprocessing), composed by `PremiereScene` inside
  `PremiereCanvas` (`dpr [1, 2]`, ACES 1.18, `#050407` background/fog,
  camera kept in the scene graph for the border). Mount order matters:
  the camera moves before the anchored backdrop/lighting read its z.
- **GLSL and builders.** Shader sources moved verbatim to
  `scene3d/shaders/*.glsl.ts` (pinned by a signature test); the searchlight
  beam canvas became `scene/searchlightTexture.ts`. Geometry/texture
  builders (`decoCards`, `environment`, the frame grammar) are untouched.
- **Wiring.** `usePremiereRuntime` creates the store synchronously and the
  audio engine in an effect; `CinematicStage` renders the Canvas inside the
  same `cinematic-stage__canvas` div and flags `data-frame-ready` on it. The
  stage accepts a null store so jsdom controller doubles mount no Canvas.

## The one real bug found on the way

R3F clones the `uniforms` object when applying the JSX prop, so mutating a
`useMemo`d uniforms object in `useFrame` silently writes to an orphan. The
green light sat at `uIntensity 1` forever; only the two mobile shots where
the camera faces the plane caught it (desktop Act I is already past the
plane at 6.7 s). A scene-dump probe proved position/scale/intent all correct
and only the uniforms stale. `GreenLight` and `GoldDust` now write uniforms
through the material ref — **any future shader component must do the same.**

## Evidence

- `npx tsc --noEmit` ✓ · `npm test` 98 files / 681 tests ✓ ·
  `npm run test:coverage` 100 % ✓ (store, clamps, orbit focus, shader pins
  and the beam texture covered; components remain the gate's job).
- Bundle: 2,026.78 kB → 2,428.74 kB (gzip 957.34 → 1,076.64 kB) — fiber,
  drei and three-stdlib; deleting the manager offsets ~none of it (three
  was already bundled).

## Caveats / next

- Same environment caveat as ADDENDUM-030: SwiftShader pixels, not real-GPU
  aesthetic sign-off; recapture per-OS before trusting the gate elsewhere.
- Phase 3 (`@react-three/test-renderer` scene tests) and the optional
  Phase 4 remain as planned in ADDENDUM-022.
- Next in the programme: the deferred brass WebGL finish
  (ADDENDUM-021 §3.6), landing behind this same gate.
