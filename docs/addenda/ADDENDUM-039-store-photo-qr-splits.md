# ADDENDUM-039 — Three more hooks and a store: playback, photos, and the QR draft

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §3, §4; ADDENDUM-037/038 (the same
treatment, twice before); ADDENDUM-022 §2.1 (the store itself).
**Status:** Implemented — recorded debt 51 → **47**.
**Audience:** anyone touching the scene store, the avatar photo session, or the QR
generator's state.

## 1. What was left, and why these three

After ADDENDUM-038 the remaining *logic* debt was four rows: the store's initialiser
(two entries — `createPremiereStore` and its anonymous inner function), the photo
session hook (74 lines) and the QR generator hook (57). Everything else is a renderer
function, a geometry primitive, or a four-parameter helper whose parameters are its API.

All four were tested and all four were doing several jobs:

| Function | Lines | Jobs mixed together |
|---|---|---|
| `premiereStore` initialiser | 65 + 62 | initial state, playback, camera, host-pushed style |
| `usePhotoSession` | 74 | session bookkeeping, decode/validate, two analyses, derived view |
| `useQrGenerator` | 57 | draft state, encode chain, presets, downloads |

## 2. The store: three action groups, one initial state

`createPremiereStore` now composes four exports of the same file:

- `initialPremiereState(freezeAt)` — the twelve fields, including the rule that a frozen
  playhead starts paused (`isPlaying: freezeAt === null`);
- `playbackActions(set, get)` — time, pause, toggle, chapter jump, active chapter, elapsed;
- `cameraActions(set, get)` — the mode switch and `focusOrbit`'s seek-with-nonce;
- `styleActions(set)` — everything the host pushes in (title, frame, border, nitrate).

The store object is four spreads. Two details were preserved rather than improved:
`togglePlaying` still reads `get().isPlaying` and writes the same value it returns (the
imperative manager depended on that return), and `setCameraMode('orbit')` still *calls*
`focusOrbit` through the store rather than inlining it — so the nonce increments exactly
as before.

## 3. The photo session: state, analyses, and a view worth naming

Three moves, one of which fixed a latent duplication:

1. `model/sessionView.ts` — `SessionState`, `EMPTY_SESSION`, `cutOutOf`, and
   `sessionViewOf(state, isAdjusting)`. The view function names the rule that was
   previously an inline expression: **re-opening the cropper is ignored while a face is
   still being located**, because that search is about to move the square anyway.
2. `hooks/usePhotoAnalysis.ts` — the two independent analyses (face location, background
   removal) with the staleness guard, taking `isCurrent` and `setState`.
3. `hooks/usePhotoLoad.ts` — validate → decode → analyse, plus the sample fetch, with the
   session counter re-checked after every `await`.
4. `model/sampleFile.ts` — fetching a built-in sample and wrapping it as a `File`.

`usePhotoSession` is now bookkeeping: the two pieces of state, the warm-up effect, one
`usePhotoAnalysis`, one `usePhotoLoad`, four crop commands, and a memo that spreads
`sessionViewOf` over the state.

The ratchet earned its keep here. The first attempt at this split **grew the function to
77 lines** (formatting, plus the `usePhotoLoad` call landing before the commands) and the
"never lets a recorded function grow past its ceiling" assertion failed — the fix was to
extract the load flow as well, not to raise the ceiling. That is the difference between a
ratchet and a suggestion.

## 4. The QR generator: draft, chain, downloads

- `model/qrView.ts` — `findMatchingPreset`, `byteLength` (UTF-8, not `String.length`),
  `summaryOf`, and the `QrSummary` type;
- `hooks/useQrEncoding.ts` — the encode → plan → summary chain, memoised **at each step**
  so retyping the caption never re-encodes and changing the module shape never re-encodes
  either;
- `hooks/useQrDownloads.ts` — the SVG save and the PNG rasterisation, with the
  `isExporting` guard and its `finally` reset kept intact.

`useQrGenerator` holds the draft and returns the same 19-field object the modal already
destructured, so no component changed.

## 5. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **126 files, 1184 tests**, green. The count is unchanged from the
  previous round on purpose: these splits moved code and added no behaviour, and no test
  needed editing.
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines; the new
  `qrView.ts`, `sessionView.ts`, `sampleFile.ts`, `useQrEncoding.ts`, `useQrDownloads.ts`,
  `usePhotoLoad.ts` and `usePhotoAnalysis.ts` are each 100/100/100/100 through the hook
  and component suites.
- `npm run build` — succeeds.
- `src/discipline.test.ts` — 6 tests; `DISCIPLINE_DEBT.length ≤ 47`.

## 6. Where the debt stands, honestly

**47 rows**, and the useful work there is now finished. What remains is:

- **10 renderer functions** in the classic Three.js layer — `createGatsbyCardRig` 178,
  `createDecoWallpaperTextures` 176, `buildAtmosphericWorld` 171, `createBallroomEnvironment`
  84, `createScreenBorderRig` 72 and the rest. They are pinned by geometry goldens and
  headless scene tests, they are three.js state machines rather than decisions, and the two
  largest are deleted with `GatsbySceneManager` once the screenshot gate passes.
- **17 geometry primitives** whose parameters are drawing coordinates (`addSunburstFan`
  takes 13). An options object would hide exactly the information a reader needs.
- **16 component functions** (timeline, header, dialogs, overlays). They render subtrees;
  the ones that carried real logic have already given it to hooks.
- **4 tiny helpers** with four parameters each (`ovalDistance`, `endpointSlope`,
  `drawTipGlow`, `arcPoints`) — splitting them would be noise, and the table says so.

Nothing further in the register can be closed from a sandbox without a browser:
Playwright has never run (no Chromium, no baselines), `GatsbySceneManager` cannot be
deleted until those baselines exist, the Deco Lattice stills comparison is a visual check,
and the Docker / SHIP-HATS deferrals are gated on infrastructure decisions, not code.

**No browser in this sandbox; visual verification pending.** Every round of this programme
has ended with that sentence, and it remains the single outstanding item that matters.
