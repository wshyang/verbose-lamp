# ADDENDUM-026 — GLSL shader source files: implementation record

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §2, §3; CLAUDE.md §1, §2, §5, §7. Implements ADDENDUM-025.
**Status:** Implemented — checked with Playwright (headless Chromium, SwiftShader); no real GPU, no human eye.

## 1. What was decided / done

The three standalone shader programs moved out of `GatsbySceneManager.ts` into
`src/features/premiere/scene/shaders/`:

| Program | Files | Uniform factory |
|---|---|---|
| Cinema nitrate post pass | `cinemaNitrate.vert`, `cinemaNitrate.frag` | `createCinemaNitrateUniforms()` |
| Green light | `greenLight.vert`, `greenLight.frag` | `createGreenLightUniforms()` |
| Gold dust | `goldDust.vert`, `goldDust.frag` | `createGoldDustUniforms()` |

Supporting modules: `uniforms.ts` (pure factories, no `three` import), `glslDeclarations.ts` (pure parser for
`uniform` / `attribute` names), `index.ts` (barrel, imported by the manager). Sources are imported with Vite's
`?raw`. No dependency was added; `vite.config.ts` and `vitest.config.ts` are untouched. The
`onBeforeCompile` patches in `art-deco-frame` stay inline, as decided in ADDENDUM-025 §1.

CLAUDE.md §5 now states the convention. ADDENDUM-022 §2.3 now points at this folder instead of `*.glsl.ts` copies.

## 2. Why

See ADDENDUM-025 §2. In short: `?raw` is the built-in, zero-config route, it keeps `vite-plugin-singlefile` delivery
intact, it gives the shaders their own files, and it lets a test catch uniform-name drift between GLSL and TypeScript.

## 3. Deviations from the plan in ADDENDUM-025

- `tDiffuse` in `createCinemaNitrateUniforms()` is typed `UniformSlot<unknown>` (value `null`), because the factory
  must not import `three`'s `Texture` type. `ShaderPass` overwrites it each frame.
- The Playwright tooling was a one-off install of `playwright@1.64.1` in a temp directory, not a project
  dependency. Playwright e2e in the repo stays deferred (ADDENDUM-001).
- The plan proposed a spec-section list of §2, §3 only; the convention also touches CLAUDE.md §5, updated above.

## 4. Practical impact / what a future reader must know

- `GatsbySceneManager.ts`: 767 → 649 LOC (still over the 400 target; remaining debt is listed in ADDENDUM-001).
- To add a shader: put `.vert` / `.frag` beside the feature, add a factory in `uniforms.ts`, add a row to
  `CONTRACTS` in `shaders.test.ts`.
- No `#include` between our files. Revisit `vite-plugin-glsl` when two shaders need the same chunk
  (`hash12` is the first candidate).
- Editors show `.vert` / `.frag` as plain text unless a GLSL extension is installed.
- A shader *edit* is a visual change and needs its own addendum; this change is a pure move.

## 5. Validation actually performed

- `npx tsc --noEmit` clean; `npm test` 431 tests in 61 files pass (17 new: 6 parser, 11 contract); `npm run build`
  succeeds.
- `dist/index.html` contains the shader source (`gl_PointCoord` found) and `dist/` has 0 `.frag` / `.vert` files.
- **Exactness:** the six old template-literal bodies equal the six new files after whitespace normalisation.
  This is the proof that the move changed nothing.
- **Playwright (headless Chromium, SwiftShader, 1280×720):** scrubbed to 0.5, 3, 6.5, 10, 17 and 30 s and toggled the
  1920s nitrate filter, before and after. The console shows no new messages: only the `THREE.Clock` deprecation
  and SwiftShader `ReadPixels` stall warnings, identical to the baseline. The after frames I viewed (3 s and the
  nitrate toggle) show the green beacon with its water reflection, gold dust, and the black-and-white nitrate grain and
  vignette.
- **Pixel comparison is a sanity check, not a proof:** mean per-channel difference before vs after was 4.8–15.9; two
  identical "after" runs differ by 6.1–11.2. The shaders animate on wall-clock `uTime` and the dust is randomised, so
  frames are not reproducible.
- **Not verified:** real-GPU rendering, other browsers (WebKit), playback smoothness, and the frames at 6.5, 10, 17
  and 30 s were compared numerically but not inspected by eye.

## 6. Manual check for the user

`npm run dev`, then: the opening green beacon pulses; gold dust twinkles through the corridor; the "1920s Nitrate"
button switches to silver-and-black with grain and scratches. Rollback: revert the implementing commit.
