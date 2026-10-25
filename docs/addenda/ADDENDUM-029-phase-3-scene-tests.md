# ADDENDUM-029 — Phase 3 scene tests without a GPU: `@react-three/test-renderer`

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §7; BUILD_PROMPT §3, §7;
ADDENDUM-022 §7 (Phase 3), §2.3; ADDENDUM-026 §3, §5; ADDENDUM-028 §6.
**Status:** Implemented — the GL-only children remain unverified without a browser.
**Audience:** anyone adding a scene component, and any reader who wants to know
exactly which part of the R3F port is now under test.

## 1. The gap this closes

ADDENDUM-026 §3 recorded "`@react-three/test-renderer` suites are **not** written".
That was the last piece of ADDENDUM-022 Phase 3, and the only remaining work in the
project that did not need the user's browser. It is now written.

## 2. What was needed to make a headless scene run

Three things stood between jsdom and the real components:

1. **The package.** `npm i -D @react-three/test-renderer@9.1.1` (matching
   `@react-three/fiber@9`). It is the only dependency added this round.
2. **`Path2D`.** jsdom has no `Path2D`, and the deco alphabet traces every glyph
   through one. `src/test/canvasStub.ts` now exports `installPath2d()` (called from
   `installCanvas2d()`): a recording stub with `moveTo`, `lineTo`,
   `quadraticCurveTo`, `bezierCurveTo`, `arc`, `closePath`. It records; it does not
   rasterise.
3. **React's act flag.** The renderer drives React's `act`, so `setupDom.ts` sets
   `IS_REACT_ACT_ENVIRONMENT = true` for DOM environments. Without it React warns
   that the environment cannot support `act`.

## 3. One production change, made for a real reason

`PremiereScene` used to compose all nine children inline. Two of them —
`BallroomEnvironment` (`createBallroomEnvironment(gl)` renders a softbox into a
render target) and `CinemaComposer` (`EffectComposer` + `UnrealBloomPass` +
`ShaderPass`) — cannot exist without a WebGL context. Mounting `PremiereScene`
headless was therefore impossible without mocking, and a mock would have tested the
mock.

So the composition was split:

- **`scene3d/PremiereStage.tsx`** — the clock, the five card rigs, the camera, the
  screen border and the atmosphere. Everything a GPU is not needed to *build*.
- **`scene3d/PremiereScene.tsx`** — `<PremiereStage/>` + `<BallroomEnvironment/>` +
  `<CinemaComposer/>`. It is now seven lines of composition and behaviour is
  unchanged.

Two one-line additions make the graph inspectable: `TitleCard` names its rig
`card:<chapter-id>` and `ScreenBorder` names its root `screen-border`. Both show up
in three.js devtools and in the tests.

## 4. The suites

`scene3d/TitleCard.test.tsx` (6)

- Every frame uniform equals `cardPhase({ localT, isFinale })` at `localT = 0.5`.
- The finale holds: `uPartOpen` stays 0 while the opacity matches `cardPhase`.
- `localT = 1.2` (past `CARD_WINDOW.after = 1.18`) hides the root.
- The `scale` it is given is applied to the root.
- **Two style changes inside one frame rebuild the geometry once** — the coalescing
  claim, proved by counting `BufferGeometry.dispose` (exactly 1).
- Unmount disposes the rig: geometry and material disposed.

`scene3d/PlaybackClock.test.tsx` (9)

- Advances by the frame delta; does not advance while paused.
- **Caps a long step at `MAX_FRAME_STEP_S`** (a 500 ms stall advances 50 ms).
- Wraps to 0 at `TOTAL_SEQUENCE_DURATION`.
- `?freezeAt` pins `elapsed` and never moves `currentTime`, even with `isPlaying`.
- `onFrameReady` fires exactly once, after `FRAME_READY_COUNT` frozen frames.
- One `onChapterChange` per handover, not one per frame.
- Telemetry throttled to one report per `TELEMETRY_INTERVAL_MS`, carrying the
  chapter it just moved into.

`scene3d/PremiereStage.test.tsx` (7)

- One card per chapter, each at its chapter's `zPosition`.
- **Changing the hero title replaces exactly one rig**: the other four roots keep
  their object identity, so no geometry was rebuilt for them.
- The screen border is visible only while enabled.
- A border style change disposes exactly one geometry — re-styled in place, not
  rebuilt.
- The clock runs before the cards, so both read the same playhead within a frame.
- A frame-style change keeps all five cards alive; orbit mode does not disturb them.

### How the uniforms are asserted

The gold material is a `MeshStandardMaterial`; the trim uniforms live in the rig's
closure and only reach the material inside `onBeforeCompile`, which a real renderer
calls when it compiles the program. Under the test renderer nothing compiles, so
`uniformsOf()` invokes the same hook with a stand-in shader object. The hook stores
the rig's *own* uniform objects by reference, so the values read afterwards are the
ones `updateState` wrote — the same path the GPU takes, minus the GPU. This is
recorded in a comment at the helper.

### How the camera is reached

The screen border is parented to the camera, and production adds the camera to the
scene graph in `applyRendererLook` (`onCreated`). The test renderer has no
`onCreated`, so the suite mounts a one-line probe component beside the stage that
hands the live camera back to the assertion. Without the probe the border lookup
would be `undefined` — and the first draft of the border test passed *vacuously*
for exactly that reason (`undefined === undefined`); the probe is what makes it real.

## 5. What is still not covered, and why that is honest

| Not tested | Why |
|---|---|
| `BallroomEnvironment` | Needs a real GL context to render the softbox into a render target |
| `CinemaComposer` | `EffectComposer` / `UnrealBloomPass` need real GL and real render targets |
| `PremiereCanvas` | R3F `<Canvas>` needs a WebGL surface; only the e2e suite can mount it |
| The look itself | Motion, glow, bloom and the likeness of the ballroom are visual judgements |

ADDENDUM-022 Phase 3 asked for exactly the three suites above and got them; the
"without a GPU" in its title is why the GL-only children were excluded from
`PremiereScene.test.tsx` in the plan, too. The difference is *how* they were
excluded: a seam here, a mock in the plan.

## 6. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **116 files, 1114 tests**, all green (was 113 / 1092).
- `npx vitest run --coverage` — still 100 % on statements, branches, functions and
  lines; the thresholds hold.
- `npm run build` — succeeds, 1.77 MB single file.

**No browser in this sandbox; visual verification pending.** These tests prove the
port's *wiring and timing*, not its appearance.

## 7. What remains

1. Playwright (`e2e/likeness.spec.ts`, `e2e/flows.spec.ts`) — written, never run; no
   browser binaries can be fetched here.
2. The user's screenshot gate: every Phase 0 shot must pass against unchanged
   baselines.
3. Deleting `GatsbySceneManager.ts` (729 LOC) once that gate is green — ADDENDUM-022
   §2.5. Not before.
