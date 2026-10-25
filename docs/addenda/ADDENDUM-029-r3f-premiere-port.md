# ADDENDUM-029 — The React Three Fiber premiere port (Phase 2)

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §3, §5, §7; CLAUDE.md §2, §5, §6, §7. Implements ADDENDUM-022 Phase 2 as integrated by ADDENDUM-027; builds on ADDENDUM-028 (the pure seams) and ADDENDUM-026 (shader files).
**Status:** Implemented, opt-in. `?renderer=r3f` mounts the port; the imperative manager is still the default and is deleted only after Phase 3's measured parity. **The port has been smoke-tested in a real browser but has not passed a parity check; see §5.**

## 1. What was decided / done

The premiere scene is re-expressed as a React Three Fiber tree over one vanilla zustand store, reusing every Phase 1 module. Nothing is re-derived.

| Piece | Files | Base | Taken from the others |
|---|---|---|---|
| State | `scene3d/premiereStore.ts` | PR #4 (three action groups, `initialPremiereState`) | PR #6 (`frameStyleVersion`, options seeding), PR #5 (orbit request counting) |
| Scene API | `scene3d/storeSceneApi.ts` | PR #6 | PR #3's StrictMode regression tests |
| Clock | `PlaybackClock.tsx` | PR #6 | PRs #2/#3: frame-ready fires in every mode |
| World | `LightingRig`, `DecoWall`, `Searchlights`, `GreenLight`, `GoldDust`, `Backdrop` | PR #6 | PR #5 `Backdrop` grouping; PRs #3/#6 seeded dust |
| Cards | `TitleCard`, `ScreenBorder`, `PremiereScene` | PR #3 / #6 | role from `cardRole` (PR #5); slots instead of booleans |
| Camera | `CinemaCamera`, `pointerAim`, `usePointerAim` | PR #6 | three's `OrbitControls`, not drei |
| Canvas | `PremiereCanvas`, `applyRendererLook`, `composer`, `CinemaComposer`, `BallroomEnvironment` | PR #6 / #3 | — |
| Wiring | `usePremiereRuntime`, `CinematicStage`, `GatsbyPremiere`, `model/renderer.ts` | PR #4/#6 idea | — |

Shaders are the `.vert`/`.frag` files from ADDENDUM-026, imported through the existing barrel. PR #3's six GLSL literals equal them after whitespace normalisation (checked), so no PR's shader strings were lifted.

## 2. Decisions and where I departed from the PR I based on

- **Callbacks are props, never state.** PRs #2 and #3 put `onTelemetry`/`onChapterChange` in the store, which makes the store depend on its host.
- **`dispose()` is a no-op.** Only PR #3 found the bug (in a real browser): its `dispose()` paused the clock, so React StrictMode's mount, dispose, remount left a dev-mode premiere loaded but paused. PRs #5 and #6 avoided it by accident and never tested it.
- **Frame-ready fires in every mode.** PRs #5 and #6 fired it only when frozen; the end-to-end flows wait on it for live visits too. A test fails against the frozen-only version.
- **No boolean flags** (CLAUDE.md §6). PR #6's `isFinale` prop and `withEnvironment`/`withComposer` flags became `index` (role derived from `cardRole`) and `environment`/`composer` slots. The `ScreenBorder` rig is built in an effect and held in state, not in `useMemo` (a GPU object built as a render side effect would be built twice under StrictMode's double render; reasoned, not measured).
- **The border does not bump the card counter.** The shipped manager rebuilt cards for frame style only. PR #6 bumped the counter for both.
- **Default genomes are never aliased.** Initial styles run through the clamps, which build fresh objects; PR #5 shared the reference.
- **three's `OrbitControls`, not drei.** PR #5's audit found drei adds a dependency for one component.
- **Pointer easing keeps the manager's 50 ms delta cap**, which PR #6's `stepToward` lacked: a stalled frame snapped the aim.
- **`playback.ts` lives in `scene/`**, not `scene3d/`, so the pure clock can be imported without the React tree.

## 3. Defects found and fixed in this phase

| Defect | Where | How it was found |
|---|---|---|
| My first StrictMode tests could not fail: `renderHook`'s wrapper does not double-invoke effects, so they passed against PR #3's pausing `dispose` | `usePremiereRuntime.test.tsx` | Sabotage run showed all passing; probed the harness, rewrote with `render`; the live-playing test now fails against the pausing version |
| PR #6's `ScreenBorder` builds its GPU rig inside `useMemo`; a render-time side effect would build a second rig under StrictMode's double render. Reasoned from how React works, **not measured here**. | `ScreenBorder` | Design review; the rig is built in an effect instead |
| The renderer's default camera is not in the scene graph, so a camera-parented border silently vanishes | `applyRendererLook` | PR #6's note; four tests fail without `scene.add(camera)` |

## 4. Practical impact / what a future reader must know

- Default behaviour is unchanged: with no `?renderer=` the manager mounts exactly as before, and its 12 recorded frame traces still pass.
- `?renderer=r3f` mounts `PremiereCanvas` inside the same container, which keeps `data-testid="cinematic-stage__canvas"`, the accessible name, the orbit cursor and `data-frame-ready`.
- `.tsx` files are excluded from the coverage gate (CLAUDE.md §2: rendering is thin). Their behaviour is covered by renderer-driven tests and is **not** counted in the percentages. The pure modules stay under named 100 percent thresholds.
- `?freezeAt=` exists only on the port path; the imperative manager ignores it.
- The R3F tests run `useFrame` through `@react-three/test-renderer` with no GPU; the composer, the environment bake and `<Canvas>` itself are doubled at their module seams.

## 5. Real-browser smoke test, and what it does and does not show

Run in headless Chromium on SwiftShader (software GL), via a one-off Playwright outside the repo:

- `?renderer=r3f&freezeAt=3` mounts a real WebGL canvas at 1280 by 720 with **no console errors**, shows the green beacon, dust and GG gate, and sets `data-frame-ready="true"`. `?renderer=r3f` live mounts too. `?renderer=manager` never sets `data-frame-ready` (the manager has no such signal), as before.
- **An attempted manager-versus-port pixel comparison was invalid and is discarded.** I captured both at `?freezeAt=` times, but the manager ignores `?freezeAt=` and plays live, so its frames were at an arbitrary time while the port's were frozen (at "t=10 s" the manager showed the Act I opening and the port showed Act II). The mean differences I computed (16 to 24) therefore measure the wrong thing and prove nothing about parity.
- Frame-ready arrived after about 5 s live and about 10 s frozen in this software-GL browser. I have not investigated whether that latency is shader compilation or a real problem.

**What is therefore still unverified:** whether the port looks the same as the manager. That is the Phase 3 job, and it needs the manager frozen the same way, by driving its time through the scrubber or the `setTime` API rather than the URL.

## 6. Test merge record (this phase)

| Subject | Tests | Source of assertions |
|---|---|---|
| `premiereStore` | 34, plus 2 for the selector hook | union of the five PRs' store suites, de-duplicated by assertion; new: aliasing, selector isolation |
| `storeSceneApi` | 8 | PR #6's adapter tests; PR #3's dispose semantics inverted and expanded to a StrictMode round trip |
| Components | `PlaybackClock` 13, `LightingRig` 6, `CinemaCamera` 10, atmosphere 24, `TitleCard` 14, `ScreenBorder` 8, `PremiereScene` 11, GPU pieces 9, canvas 9, `applyRendererLook` 6, `composer` 8, pointer 15 | PRs #3, #5, #6 component suites; new: priority, disposal counts, frame-ready in every mode |
| Wiring | `renderer` 15, `usePremiereRuntime` 20, `CinematicStage` 11 | new (no PR tested the wiring) |

The per-assertion duplicate counts the plan's Phase T calls for are produced once, at the end (ADDENDUM-036).

## 7. Validation actually performed

- `npx tsc --noEmit`, `npm test` (898 tests, 89 files), `npm run build` pass after every task; the coverage gate passes.
- Verified to bite (each test fails against the sabotage and passes against the real code): unseeded dust, an always-visible green light, rebuilding a card rig on a scale change, never disposing the border rig, composer at priority 0, camera not added to the scene, no upright reset leaving orbit, frame-ready only when frozen, and PR #3's pausing `dispose`.
- Global coverage rose from 66.3 to 67.6 percent statements; the floors were raised to match.
- **Not performed:** a manager-versus-port parity comparison (§5), any real-GPU run, WebKit, or a human visual check.
