# ADDENDUM-041 — Feature entry points, enforced: pure `model` entries and a boundary test (modularity review, Finding 2)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §2; CLAUDE.md §6; `docs/modularity-review/2026-10-26/modularity-review.md` (Issue 2); ADDENDUM-034 (the discipline ratchet this follows).
**Status:** Implemented. Type-checks, tests pass, coverage holds at 100 %, builds; nothing rendered in a browser (none in the sandbox), so visual verification is pending.

## 1. What was decided

CLAUDE.md said a feature's barrel is "the only door", but one barrel cannot serve both a pure consumer and a React or Three.js one, so consumers reached past it, and nothing failed when they did (`barrels.test.ts` only proves each barrel loads). Two changes:

**A pure entry per feature that needs one.** `@/features/deco-lattice/model` and `@/features/premiere/model` export only pure code (the generator, tone, presets and types; the sequence data and model types), with no React, no Three.js and no DOM. Each feature's main barrel re-exports it (`export * from './model'`), so no existing import of a barrel changes.

**A test that enforces it** (`src/featureBoundaries.test.ts`). It parses every production source file with the TypeScript compiler and fails when:
1. a feature is reached through anything but `@/features/<name>` or `@/features/<name>/model`;
2. a feature imports a feature its row in `ALLOWED_FEATURE_DEPS` does not list;
3. `shared/` imports a feature, or a feature imports `app/`;
4. any file reachable from a `model/index.ts` entry through relative value imports imports React, Three.js, `@react-three/*` or zustand (type-only imports are allowed: they are erased). The first version of this check read only the entry file's own specifiers, all of which are relative, so it could not fail; a code review caught that, and it now walks the imports transitively.

`KNOWN_EXCEPTIONS` exists for imports not yet migrated, each with a reason, and may only shrink. It is empty.

## 2. Imports that moved

| Importer | Was | Now |
|---|---|---|
| `art-deco-frame` `edgeBorder.ts` | three deep paths into `deco-lattice/model/*` | `@/features/deco-lattice/model` |
| `art-deco-frame` `latticeSource.ts` | the full `deco-lattice` barrel plus a deep `tone` path, with a comment claiming purity | `@/features/deco-lattice/model` (the comment is now true) |
| `title-customizer` (5 source files) | `premiere/data/sequence`, `premiere/model/types` | `@/features/premiere/model` |
| `app/components/CinematicStage.tsx` | `premiere/scene3d/PremiereCanvas`, `premiere/scene3d/premiereStore`, `premiere/scene/sceneApi` | the `premiere` barrel, which now exports `PremiereCanvas` and the types `PremiereStoreApi`, `PlaybackTelemetry`, `PremiereSceneApi` |
| `frame-studio` `data/frameDesigns.ts` | a relative `../../art-deco-frame` | `@/features/art-deco-frame` |
| `premiere` `model/types.ts` | `art-deco-frame/model/types` | the `art-deco-frame` barrel (type-only) |

## 3. Practical impact / what a future reader must know

- A new cross-feature import is now a decision: it needs a row in `ALLOWED_FEATURE_DEPS`, which a reviewer reads in the diff. A deep import fails the test.
- The test was seen to fail: a deep `premiere/data/sequence` import and an undeclared `premiere -> frame-studio` edge were each planted, the matching assertion failed, and both were restored. The purity rule was found vacuous in review (a `three` import planted in `deco-lattice/model/tone.ts` passed), fixed, and then seen to fail on that plant and on a `zustand` import in `premiere/data/sequence.ts`.
- Test files and `testing/` helper folders are outside the rule. Six imports in test files still reach feature internals (`premiere/scene3d/premiereStore` ×2, `spectacle/testing/recordingCanvas`, `spectacle-preview/testing/stubPreview`, `spectacle-preview/data/previewCatalogue`, `frame-studio/data/frameDesigns`); they are tests reaching for a feature's own data or helper.
- The review said `premiere/model/types.ts` importing `art-deco-frame/model/types` "loads Three". It was `import type`, erased at build, so it never did; this change only makes the path conventional. The model-entry purity test allows type-only imports for that reason.
- `ALLOWED_FEATURE_DEPS` records the graph as it is, including `spectacle-preview -> gilded-ui` and `event-night`'s five dependencies. Narrowing it (for example by finishing the console clean-up in ADDENDUM-040 §4) is a reviewed edit to that table.

## 4. Validation actually performed

`npx tsc --noEmit` clean; `npm run test:coverage`: 590 files, 4333 tests pass, statements 100 % (5441), branches 100 % (1895), functions 100 % (1286), lines 100 % (4745); `npm run build` succeeds. `grep` finds no `@/features/<name>/<deeper>` import left in non-test source. Browser, e2e and the likeness gate were not run.
