# ADDENDUM-038 — The premiere's two hooks: renderer selection and the telemetry bridge

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4; ADDENDUM-037 (the same
treatment applied to the studio hook); ADDENDUM-026 §5 (the two renderers).
**Status:** Implemented — recorded debt 52 → **51**; `usePremiereRuntime` 70 → 25 lines,
`usePremiereController` 71 → 45 lines.
**Audience:** anyone touching renderer mounting, the HUD clock, or the `?renderer=` switch.

## 1. Two hooks doing four jobs each, and both already tested

Neither hook was broken. `usePremiereRuntime` (70 lines) and `usePremiereController`
(71 lines) each had 8–9 hook tests and a clean coverage line, and both were still the
largest *logic* functions left after the studio split. The problem was the same one
ADDENDUM-037 named: a hook that owns four concerns cannot be read to answer any one
question.

`usePremiereRuntime` mixed URL parsing, store creation, callback identity and the mount
effect — so "when does the classic manager get disposed?" required reading past three
unrelated things. `usePremiereController` mixed the telemetry throttle with scene
wiring, which meant the 48 ms constant lived in the middle of a hook that also builds
the transport.

## 2. Where the code went

**Runtime → three hooks plus composition**

| Module | Owns |
|---|---|
| `hooks/useRendererSelection.ts` | `parseRenderer(window.location.search)`, and the store created **once** for the React renderer |
| `hooks/useSceneCallbacks.ts` | the three callbacks both renderers speak (`onTelemetry`, `onChapterChange`, `onFrameReady`), memoised, reading live handlers through a ref |
| `hooks/useRendererMount.ts` | the effect: construct `CinemaAudioEngine`, mount the store API or `GatsbySceneManager`, dispose both |
| `hooks/usePremiereRuntime.ts` | 25 lines: calls the three, returns `{ renderer, store, sceneCallbacks }` |

The store-once rule is now explicit and named: rebuilding the store per render would
reset playback, so `useRendererSelection` keeps it in a ref and says why.

**Controller → one extracted hook**

`hooks/useTelemetryBridge.ts` owns `currentTime`, `isPlaying`, `activeAct`, the
`onTelemetry` throttle (`UI_SYNC_INTERVAL_MS = 48`, hoisted to a named constant) and
`onChapterChange`. The controller now reads as wiring: refs, the bridge, the runtime, the
frame studio, transport, scene options.

### Why the frame studio is *not* extracted

`usePremiereController` could shrink further by moving the frame-studio binding out, but
that would move the controller's most load-bearing line — `useFrameStudio(getSceneManager)`
— into a hook that exists only to hold it. The limit is 50 lines and the composition is
45; the split is driven by the ratchet and by what a reader needs, not by a line count.

## 3. What stayed identical

Three contracts a careless "cleanup" would have changed:

- **The throttle keeps its exact semantics**: skip if `now - last <= 48`, then update
  *both* time and playing state together. Dropping the shared `lastUiSyncRef` would have
  let the two values tear apart between frames.
- **The React renderer's cleanup does not touch the manager.** On unmount it disposes the
  audio engine and nulls the refs — the store keeps its own scene API. The classic path
  disposes the manager *and* the audio. Both paths are still separate branches of one
  effect.
- **`onChapterChange` still shimmers the audio** — through `audioRef.current?.` for the
  shared callback, and through the local `audio` instance inside the classic mount. That
  duplication is deliberate: the classic manager is constructed with the audio it will
  shimmer, so a callback captured before that construction cannot be reused.

All 125 premiere tests passed **without edits**, as did the app-level controller tests.

## 4. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **126 files, 1183 tests**, green.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines, including
  all four new modules.
- `npm run build` — succeeds.
- `src/discipline.test.ts` — 6 tests; `DISCIPLINE_DEBT.length ≤ 51`.

## 5. Where the debt now stands

**51 rows.** After this round every remaining recorded row is one of:

- a **renderer** function in the classic Three.js layer (the largest four are
  `decoCards.createGatsbyCardRig` 178, `environment.createDecoWallpaperTextures` 176,
  `GatsbySceneManager.buildAtmosphericWorld` 171, `environment.createBallroomEnvironment`
  84) — pinned by geometry goldens and headless scene tests, and the first two are
  deleted with the manager when the screenshot gate passes;
- a **geometry primitive** whose parameters are drawing coordinates (`addSunburstFan` 13
  params) — an options object would hide the content;
- a **remaining hook** (`usePhotoSession` 74, `useQrGenerator` 57, `premiereStore` 65+62)
  — the same treatment is available and cheap;
- a handful of small, linear orchestrators carrying four parameters each, where the
  parameters are the API.

**No browser in this sandbox; visual verification pending.** This round changes when the
renderer is constructed, not what it draws — but "not what it draws" is a claim only the
pending screenshot pass can actually close.
