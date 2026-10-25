# ADDENDUM-032 — The React Three Fiber port: Phase 2 of 022 implemented, and the one number that was missing

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (§6 Phase 2 steps 2.1–2.5, §7 Phase 3, §9 impact), ADDENDUM-029 (gate), ADDENDUM-031 (Phase 0.7 choreography extraction). CLAUDE.md §2, §4, §7; BUILD_PROMPT §2.
**Status:** Phase 2 complete. The port is mounted behind `?renderer=r3f`, the **likeness gate is green on the port** (12/12 desktop-chromium shots against the *unchanged* baselines, and 12/12 on the manager), `tsc` is clean, **1516 tests in 187 files** pass, and coverage is **99.28 % statements / 93.78 % branches / 98.98 % functions / 99.59 % lines**. The default path is still `GatsbySceneManager`.

ADDENDUM-022 §6 called Phase 2 "the port": rebuild the premiere as declarative components over a
`zustand` store, one concern per file, so that the sequence can be tested with
`@react-three/test-renderer` instead of a browser. That is what this addendum contains. It also
records the single line that made the port pixel-identical to the manager, because that line is the
most useful thing in the whole phase.

## 1. What was built

All new files are under `src/features/premiere/scene3d/` unless noted.

| Layer | File | Concern |
|---|---|---|
| Pure | `scene/styleClamp.ts` | `clampFrameStyle` / `clampScreenBorderStyle`: the last frame is excluded, a chapter jump is nudged 0.15 s forward (`LAST_FRAME_EPSILON`, `CHAPTER_JUMP_OFFSET`) |
| Pure | `scene/orbitFocus.ts` | `orbitFocusPlan(time, chapter)`: enter at 0.42, exit at 0.85, local 0.56, offset `[2.4, 0.9, 9.2]` |
| Pure | `scene/rendererMode.ts` | `parseRendererMode` (`?renderer=`), `parseFreezeAt` (`?freezeAt=`) |
| Pure | `scene3d/playback.ts` | `advanceClock` (cap `MAX_FRAME_DT` 0.05, wrap at 38 s), `advanceElapsed`, `FRAME_READY_FRAMES` |
| State | `scene3d/premiereStore.ts` | One `zustand` store: time, playing, freeze, chapter, camera mode, frame/border style, telemetry counters |
| Bridge | `scene3d/storeSceneApi.ts` | `storeSceneApi(store)` presents the store behind the *existing* scene API, so the hooks did not change |
| Shaders | `scene3d/shaders/{greenLight,goldDust,cinemaNitrate}.ts` | GLSL lifted out of the manager unchanged |
| Look | `scene3d/applyRendererLook.ts` | ACES at 1.18, `#050407` background, `FogExp2 0.022`, 42° lens, and **`scene.add(camera)`** |
| Components | `PlaybackClock`, `TitleCard`, `DecoWall`, `Searchlights`, `GreenLight`, `GoldDust`, `LightingRig`, `BallroomEnvironment`, `CinemaCamera`, `ScreenBorder` | Each is a small, prop-driven piece of the old `buildAtmosphericWorld` / `buildAllCards` |
| Composition | `PremiereScene.tsx`, `PremiereCanvas.tsx`, `CinemaComposer.tsx` | The scene, the `Canvas`, and the bloom → nitrate → output pipeline |
| Hook | `hooks/usePremiereRuntime.ts` | Owns audio and the scene API; given a `store` it never constructs `GatsbySceneManager` |

Two rules the phase held to, both from CLAUDE.md §2: **components render, hooks decide**, and no
file above 200 LOC. `CinemaComposer` is deliberately *not* `@react-three/postprocessing` — a
different bloom is a different picture, and swapping post stacks is a Phase 4 experiment, not a
port.

## 2. The switch, and why the manager still owns the default

`usePremiereController` parses the URL once per mount and returns `renderer: 'manager' | 'r3f'`
plus a memoised `store`. `CinematicStage` renders `PremiereCanvas` only when both are present; the
mount div, its test id, its cursor classes and the HUD frame are untouched. Everything downstream
(the transport hooks, the keyboard shortcuts, the frame-studio bridge) talks to the same
`managerRef` shape, because `usePremiereRuntime` installs `storeSceneApi(store)` there when a store
is passed.

```
/?freezeAt=24.82                 # manager, frozen at 24.82 s — the gate's default
/?freezeAt=24.82&renderer=r3f    # the port, frozen at the same moment
```

`e2e/support/stage.ts` now reads `PREMIERE_RENDERER` and appends it to the URL, so the whole gate
can be pointed at the port without touching a single baseline:

```
PREMIERE_RENDERER=r3f npx playwright test e2e/likeness.spec.ts
```

Unset, the gate is exactly what it was.

## 3. The one number that mattered

The first ported gate run failed 3/3 at a mean channel error of ~26/255 — close enough to look
"right" in a thumbnail and plainly wrong in a diff. A probe of both paths at `freezeAt=24.82`
found the camera at `[0, 0.2, -67.974]` on the port and `[-0.076, 0.096, -67.974]` on the manager.

Same Z. Different Y. **The port's shader clock was zero.**

`advanceElapsed(elapsed, delta, frozen)` returned `elapsed` unchanged while frozen, and the store
initialises `elapsed` to `0`, so a frozen frame ran every ambient shader — grain, gold dust,
searchlight sway — and the camera's drift (`sin(elapsed * 0.42)`, `0.14 + cos(elapsed * 0.35)`)
at time zero. The manager had always read `elapsed = freezeAt ?? clock.elapsedTime`.

The fix is one signature: `advanceElapsed(elapsed, delta, freezeAt)` returns `freezeAt` when it is
not `null`, and the store seeds `elapsed: freezeAt ?? 0`. Two tests were asserting the old
behaviour and now assert the contract ("holds a frozen frame at the moment it was frozen at, not
at zero").

After it, acts I, IV and V passed against the untouched baselines on the first attempt.

This is the argument for a likeness gate stated as plainly as it can be: the port was
*plausible*, was typecheck-clean, had 60 passing unit tests, and was still wrong by a tenth of a
world unit in Y.

## 4. Tests

| Suite | Cases | What it pins |
|---|---|---|
| `scene/{styleClamp,orbitFocus,rendererMode}.test.ts` | 21 | Clamp boundaries, chapter-jump nudge, orbit window, URL parsing |
| `scene3d/{playback,premiereStore,storeSceneApi}.test.ts` | 41 | Clock cap and wrap, freeze semantics, store actions, API parity |
| `scene3d/PlaybackClock.test.tsx` | 6 | Advance, freeze, three-frame `data-frame-ready`, one chapter handover, 48 ms telemetry throttle, wrap at 38 s |
| `scene3d/TitleCard.test.tsx` | 8 | Style coalescing, phase windows, disposal |
| `scene3d/PremiereScene.test.tsx` | 5 | Rig construction, reparenting, environment/composer toggles |

`npx vitest run` → **180 files, 1481 tests**, from 171/1420 at `415471e`. `npx tsc --noEmit` is
clean.

Two testing notes worth keeping:

- `@react-three/test-renderer` needs `advanceFrames(n, dt)`; a single frame is not enough to see a
  chapter handover or a throttle window.
- `TitleCard` cannot coalesce on `frameStyleVersion > 0` — the store starts that counter at 1, so
  the first real change is invisible. The rig records the version it was built at inside its
  `useMemo` and compares against that.

## 5. Verification

- **Likeness gate, port renderer:** **12/12** `desktop-chromium` shots, including the
  nitrate-forced, orbit, screen-border and HUD variants, against the pre-existing Linux +
  SwiftShader baselines (`PREMIERE_RENDERER=r3f`, 13.0 min).
- **Likeness gate, default renderer:** **12/12** again with `PREMIERE_RENDERER` unset (16.2 min),
  so the port did not disturb the manager it was copied from.
- **Flows:** 14/16 on the first sweep, both failures timing rather than behaviour. The title
  customizer passed on a re-run; event night needed the *click itself* to carry the long timeout,
  because leaving the demo hands the main thread to the premiere's scene build for over a minute
  on SwiftShader (`noWaitAfter`, 180 s). It passes in 1.2 min after that change.
- **Bundle:** `dist/index.html` grows 1 352 533 → 1 777 905 bytes (gzip 579.56 kB). `three`'s
  post-processing modules and `@react-three/fiber` are now reachable from the default path; the
  manager is still what renders.
- **Dependencies:** `@react-three/fiber`, `@react-three/drei`, `zustand` and the dev-only
  `@react-three/test-renderer` are declared in `package.json` rather than relied on transitively.

## 6. What is left

- **Phase 3 (§7):** the stage-level seams — telemetry and chapter changes are already plumbed
  through `sceneTelemetry` / `sceneChapterChange`, so this is wiring plus tests, not new design.
- **Phase 4 (§8):** swap `UnrealBloomPass` for `@react-three/postprocessing` and re-baseline, the
  orbit → sparkler handover, and the `GatsbySceneManager` retirement once the port owns the
  default. `GatsbySceneManager` is still the fidelity reference; do not delete it before Phase 4
  lands.
- **Coverage:** the strict-global 100 % goal is unchanged and still staged. The port adds ~2000
  lines of well-partitioned code, most of it already covered; the remaining debt is DOM surfaces.
