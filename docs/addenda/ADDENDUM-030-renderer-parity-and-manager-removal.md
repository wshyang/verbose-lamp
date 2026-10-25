# ADDENDUM-030 — Renderer parity, and removal of the imperative manager (Phase 3)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §5, §7; CLAUDE.md §2, §7. Implements ADDENDUM-022 Phase 3 as integrated by ADDENDUM-027. Supersedes the opt-in wording in ADDENDUM-029.
**Status:** Implemented. The React Three Fiber port is now the only renderer. Parity was measured on SwiftShader (software GL) only; **no real GPU and no human visual check has happened.**

## 1. What was decided / done

1. **Prerequisite (`582f7876`):** the manager learned `?freezeAt=` (clocks pinned, pointer ignored) and a frame-ready signal, so both renderers could be frozen at the same instant. The default path stayed byte-identical (the 12 recorded frame traces).
2. **Parity tooling (`5246db99`, `c236f9ac`):** a Playwright script, `scripts/compare-renderers.mjs`, plus the tested pure comparison in `src/test/frameCompare.ts`.
3. **Parity measured, then the gate passed** (table below).
4. **Deleted** `GatsbySceneManager.ts`, its characterisation test and its snapshot, `model/renderer.ts` (`?renderer=` no longer selects anything) and the `parity` script, which compared two renderers and now has only one.
5. `usePremiereRuntime` always builds the store; `CinematicStage` always mounts `PremiereCanvas` and takes a required `store`. `data-testid="cinematic-stage__canvas"`, the accessible name, the orbit cursor and `data-frame-ready` are unchanged. `?freezeAt=` now seeds the store directly.

## 2. Parity result

Compared against a build of the **original `main`** (not the branch's own manager), 960×600, HUD hidden after its fade reached zero opacity, SwiftShader. Mean absolute difference per colour channel, out of 255. "Noise" is `main` captured twice and compared with itself.

| Frozen at (s) | Port vs `main` | `main` vs itself (noise) |
|---|---|---|
| 1.0 | 0.24 | 0.19 |
| 4.3 | 0.24 | 0.23 |
| 11.3 | 0.32 | 0.24 |
| 18.5 | 0.26 | 0.28 |
| 24.8 | 0.30 | 0.33 |
| 33.8 | 0.24 | 0.27 |

The port's range (0.24–0.32) sits inside the noise range (0.19–0.33); outlier ratios were 0.0018–0.0023. The two are indistinguishable at the software-GL noise floor.

Other measurements:

- Draw calls, triangles and points per frame were identical at 4.32 s (108 / 4475 / 1425) and 24.82 s (143 / 3014 / 1425).
- Camera position, rotation, fov and aspect were identical at 1 s and 18.5 s; at 33.8 s the position differs by 1.4e-14.
- **Unexplained:** at 24.82 s the manager held 12 geometries and 29 textures against the port's 8 and 25, and 21 programs against 20. Draw output is identical, so this looks like resource bookkeeping (disposal timing, or per-card duplicates), but I did not trace it.

## 3. Comparisons I discarded as invalid

| Attempt | Why it measured the wrong thing |
|---|---|
| Live manager vs frozen port (ADDENDUM-029 §5, means 16–24) | The manager ignored `?freezeAt=` and was at an arbitrary time |
| HUD captured mid-fade | A CSS transition on software GL; inflated "manager vs itself" to 10 |
| Pointer left on the play button | The manager aims at the pointer; the port ignores it when frozen |
| Frozen times 4.32 / 11.28 / 24.82 via the scrubber | The scrubber's 0.05 step snaps them to 4.30 / 11.30 / 24.80 (camera Z differs about 0.012); with scrubber-aligned times the difference vanished |

## 4. Rejected: post-processing A/B

PR #3 measured a post-processing library against the hand-wired composer and found it 9.63 % over its threshold; PR #5 measured 0.05–0.24 against a 0.01 target. Both rejected it, no code changed, and `@react-three/postprocessing` and `@react-three/drei` stay out (ADDENDUM-027). I did not re-run those measurements.

## 5. Practical impact / what a future reader must know

- **Original `main` has tracked `node_modules`**, which breaks a `git archive` build ("Invalid hook call"). The comparison used a symlink to a working `node_modules`. Commit `5529d787` untracks it on this branch.
- The comparison needed the original manager's wall-clock shader time pinned (`performance.now` overridden); the port has no such dependency.
- The legacy characterisation suite protected the manager's maths while it was refactored (ADDENDUM-028); the pure modules keep their own tests, so nothing it covered is unguarded. It was the only coverage of the manager's glue (renderer wiring, resize, pointer), which is gone with it.
- Coverage floors rose to 68 / 67 / 62 / 68 (measured 68.1 / 67.4 / 62.7 / 68.6) because the deleted file's untested lines left the denominator.
- The parity script is gone. If a future change needs it, recover it from `5246db99` and `c236f9ac`.

## 6. Validation actually performed

`npx tsc --noEmit` clean; `npm test` 864 tests in 88 files pass; `npm run test:coverage` passes its gates; `npm run build` succeeds. Parity above is from headless Chromium on SwiftShader. **Not done:** a real-GPU run, and a human look at the live premiere. Visual verification pending.
