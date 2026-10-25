# ADDENDUM-026 — ADDENDUM-022 implementation record: choreography, freeze hook, typed scene API, React Three Fiber port

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §1, §2, §5, §6, §7, §11; BUILD_PROMPT §2, §3, §7;
ADDENDUM-022 §0–§5; ADDENDUM-025 §3.
**Status:** Implemented — visual check pending (no browser in this sandbox; see §5).
**Audience:** the next agent, and any reader asking "did the likeness gate and the R3F port actually land?".

## 1. What was asked

Implement ADDENDUM-022 in full: a seeded PRNG, a `?freezeAt` hook, a typed scene API,
the choreography extracted out of `GatsbySceneManager.ts`, DOM tests around the
premiere, and a React Three Fiber renderer under `scene3d/` behind the same API.
Delete the imperative manager only after the port is green — never before the
screenshot baselines pass.

## 2. What landed

| Piece | Where | Notes |
|---|---|---|
| Seeded PRNG |  `src/shared/lib/random.ts` | `mulberry32` + `hash01`; every effect, walk and show planner takes a seed |
| Title choreography | `src/features/premiere/model/choreography.ts` | One pure function returning frames for a given time: no Three.js, no DOM, golden-tested |
| Freeze hook | `src/features/premiere/model/freeze.ts` | `parseFreezeAt(search)` → number or null; drives `?freezeAt=3.2` for deterministic screenshots |
| Renderer choice | `src/features/premiere/model/renderer.ts` | `'r3f'` by default, `'classic'` behind `?renderer=classic` |
| Typed scene API | `src/features/premiere/scene/sceneApi.ts` | `PremiereSceneApi` + `PlaybackTelemetry`; both renderers satisfy it |
| Clock / store | `src/features/premiere/scene3d/premiereStore.ts` | Zustand store: playback, camera mode, nitrate, hero title. **No `useStore` in the feature barrel** |
| R3F scene | `src/features/premiere/scene3d/*` | `PremiereCanvas`, `PlaybackClock`, `TitleCard`, `ScreenBorder`, `CinemaCamera`, `Atmosphere`, `LightingRig`, `BallroomEnvironment`, `CinemaComposer` |
| Imperative adapter |  `src/features/premiere/scene3d/premiereStore.ts` (`storeSceneApi`) | Wraps the store so the view keeps calling the same nine methods |
| Runtime switch | `src/features/premiere/hooks/usePremiereRuntime.ts` | Reads the renderer flag, constructs audio, mounts R3F from the store or the classic manager |

`GatsbySceneManager.ts` is **kept**. The reasoning is the user's own gate: the classic
renderer stays available until the screenshot baselines pass on the user's machine.

## 3. Tests added

- `scene/choreography.test.ts` — golden frames per act, freeze points, act boundaries.
- `model/freeze.test.ts`, `model/renderer.test.ts` — URL parsing and defaults.
- `scene3d/premiereStore.test.ts`, `orbitFocus.test.ts`, `styleClamp.test.ts` — store
  transitions, camera focus, clamp of style values into range.
- `hooks/usePremiereRuntime.test.tsx` — both renderers mount, telemetry and chapter
  callbacks forwarded through a live ref, freeze flag passed to the classic manager,
  frame-ready before the container exists, teardown.
- `hooks/usePremiereController.test.tsx`, `usePremiereHooks.test.tsx` — transport,
  throttled telemetry (48 ms), camera/sound/nitrate toggles, hero-title jump to act V.
- `app/**` jsdom suites and `app/testidCoverage.test.tsx` — every `data-testid` in the
  tree follows `{component-kebab}__{element-role}`.

`@react-three/test-renderer` suites are **not** written: the package is not in the
lockfile, and installing it here would need a registry round-trip for a renderer
that cannot be visually verified anyway. Recorded as open work in ADDENDUM-028 §6.

## 4. What changed in the classic renderer

None of its behaviour. The manager now receives `freezeAt` from the runtime and its
callbacks are routed through the store-backed adapter; its drawing code is untouched,
so the pending screenshot gate compares like with like.

## 5. Verification and the honest caveat

- `npx tsc --noEmit` — clean.
- `npm test` — green (see ADDENDUM-028 for the counts).
- `npm run build` — succeeds; single-file bundle unchanged in kind.
- **No browser in this sandbox; visual verification pending.** The R3F scene has been
  checked only through units: plans, store transitions, and the DOM the canvas mounts
  into. Motion, colour and the likeness of the ballroom cannot be judged from here,
  and the classic renderer therefore remains the fallback until the user's
  `?renderer=classic` baseline comparison passes.
