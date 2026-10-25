# ADDENDUM-033 — R3F Phase 3: Scene Tests Without a GPU

**Status:** Implemented. Executes ADDENDUM-022 §7 exactly as specified.

## What shipped

- **Dev dependencies:** `@react-three/test-renderer@^9.1.1`,
  `vitest-canvas-mock@^1.2.0` (the latter was already loaded for jsdom
  suites by `src/test/setupDom.ts`; now pinned as a direct dependency).
- **`scene3d/TitleCard.test.tsx`** (3 tests): at store time 4.32 the frame
  shader's `uDraw/uPartOpen/uOpacity` equal `cardPhase({localT: 0.6})`;
  at localT 1.2 the card root is invisible; on unmount every geometry
  and material in the rig disposes exactly once.
- **`scene3d/PlaybackClock.test.tsx`** (3 tests): a frozen playhead never
  advances (and `frameReady` fires once after 3 frames); the loop wraps
  to 0 at 38 s; `onChapterChange` fires once per handover, not per frame.
- **`scene3d/PremiereScene.test.tsx`** (4 tests): five card roots at the
  chapter z-positions; a `heroConfig` change replaces exactly the hero
  root; two frame-style changes inside one frame coalesce to one geometry
  rebuild (one dispose of the previous geometry); the camera-parented
  screen border is visible only when `isBorderEnabled`.
  `BallroomEnvironment` and `CinemaComposer` are mocked out (both need a
  real WebGL context — PMREM and render targets respectively).

## Enablers & decisions (recorded per the honesty rule)

- **One production touch:** `createGatsbyCardRig` stamps
  `root.userData.frameUniforms` with the exact uniforms object bound into
  the frame shader. The patched `MeshStandardMaterial` doesn't retain its
  `onBeforeCompile` uniforms anywhere reachable without a GL compile, so
  this scene-graph handle is how tests (and probes like the one that
  caught the R3F uniforms-clone bug in ADDENDUM-031) observe them. No
  behavior change.
- **jsdom gaps, handled locally:** the PremiereScene suite stubs
  `window.matchMedia` (fine-pointer desktop) because `useViewportFit`
  reads it and jsdom doesn't provide it; `setupDom.ts` sets
  `IS_REACT_ACT_ENVIRONMENT` so the test renderer's `act()` is declared.
- The teardown assertion covers geometries/materials (not textures):
  text-rig textures ride on materials whose dispose it already verifies.

## Evidence

- `npx tsc --noEmit` ✓ (after typing the Vitest 4 mock generics);
  `npm test` 102 files / 697 tests ✓ (+3 files, +10 tests); coverage
  100% ✓ (`.test.tsx` files are outside the pure-layer scope by design);
  build ✓ 2,431.02 kB — devDependency-only change, bundle unmoved.
- No likeness-gate run: per ADDENDUM-022 §10, Phase 3's verification is
  the sandbox suites; the single production touch is metadata invisible
  to the renderer. (The next slice to touch pixels re-runs the gate.)
