# ADDENDUM-039 — The host composes the Frame Studio; the premiere no longer owns it (modularity review, Finding 3)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §7; CLAUDE.md §5, §6; `docs/modularity-review/2026-10-26/modularity-review.md` (Issue 3); `docs/ARCHITECTURE.md` ("Dependencies point from the app composition into features").
**Status:** Implemented. Type-checks, tests pass, coverage holds at 100 %, builds; nothing rendered in a browser (none in the sandbox), so visual verification is pending.

## 1. What was decided

`usePremiereController` called `useFrameStudio(...)` itself and returned the result as `frameStudio`, so the runtime feature depended on the editor feature. To avoid importing the studio's target type, `sceneApi.ts` redefined the same three methods as `FrameStudioScenePort`, kept equal to `FrameStudioTarget` by a test. The dependency pointed the wrong way and the contract was maintained by a mirror.

Now the host composes them:

- `usePremiereController` no longer imports `frame-studio` and no longer returns `frameStudio`. It returns `getSceneApi`, a stable getter for the live scene API (`null` until the scene exists).
- `PremiereSurfaces` calls `useFrameStudio(premiere.getSceneApi)` and passes the result to `FrameStudioDock`. That call is itself the compile-time check that `PremiereSceneApi` satisfies `FrameStudioTarget`.
- `FrameStudioScenePort` and its tests are deleted. `src/app/sceneBinding.test.ts` asserts the same two facts at the place the features meet.
- `PremiereSceneApi` is now exported from the `premiere` barrel (type only), so the host and its test do not import `premiere/scene/sceneApi` by path.

## 2. Why

The architecture document says dependencies point from the app composition into features and that a feature must stay reusable without the others. With the old shape the premiere could not be reused without the Frame Studio, and any change to the studio's target had to be made in five places. The studio's lazy `getTarget()` is unchanged, so the timing of when it reaches the scene is unchanged.

## 3. Practical impact / what a future reader must know

- Behaviour is unchanged. The studio still drives the scene through the same three operations, read at the moment it acts, so a scene created after the studio is still driven.
- The wiring the premiere controller tests used to cover (`result.current.frameStudio.setSurface / setDetail / dismiss`) moved to `src/app/frameStudioBinding.test.tsx`: the screen border is shown on the scene when that surface is chosen, a detail change reaches the scene as a sequence frame style, a scene that appears later is still driven, and dismissing works with no scene. The studio's own behaviour keeps its tests in `frame-studio/hooks/useFrameStudio*.test.*`.
- `usePremiereController.p4.test.tsx` no longer mocks `@/features/frame-studio`; its getter test now checks `getSceneApi` (null when nothing is mounted, stable across renders).
- Adding a studio operation now touches `FrameStudioTarget` and `PremiereSceneApi` only; the compile error in `PremiereSurfaces` tells you if they drift.
- `PremiereSurfaces` was a recorded discipline row (75 lines) and the added line pushed it over its ceiling, so its HUD and dialog visibility state moved to a new hook, `app/hooks/usePremiereChrome.ts` ("a component renders, a hook decides"), with its own tests. The row is lowered to the true size, 72 lines. It is still over the 50-line limit; it is not paid off.

## 4. Validation actually performed

`npx tsc --noEmit` clean; `npm run test:coverage`: 588 files, 4318 tests pass, statements 100 % (5441), branches 100 % (1893), functions 100 % (1284), lines 100 % (4746); `npm run build` succeeds. `grep -rn "frame-studio" src/features/premiere` (non-test) finds nothing, and `FrameStudioScenePort` no longer exists. Browser, e2e and the likeness gate were not run: the Frame Studio dock was not seen driving a live scene.
