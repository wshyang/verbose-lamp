# ADDENDUM-025 — GLSL shader source: best-practice assessment and plan to move standalone shaders into files

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §2 (stack, single-file delivery), §3 (render pipeline); CLAUDE.md §1, §2, §6, §7. Amends ADDENDUM-022 §2.3 (where its shaders live).
**Status:** Implemented by ADDENDUM-026.
**Numbering note:** ADDENDUM-024 is ADDENDUM-023's implementation record, so this plan is 025 and its implementation record is 026.

## 1. What was decided

1. **Standalone shaders** (full `ShaderMaterial` / `ShaderPass` programs) move out of TypeScript template literals into
   `.vert` / `.frag` files. They are imported with Vite's built-in `?raw` suffix. No new dependency is added and
   `vite.config.ts` / `vitest.config.ts` are not touched.
2. **`onBeforeCompile` injections** (`art-deco-frame/render/frameMaterial.ts`, `art-deco-frame/render/decoTypography.ts`)
   **stay inline**. They are `.replace('#include <chunk>', …)` fragments keyed to three.js's internal chunk names. They
   only make sense next to the material code that patches them.
3. **Runtime `fetch()` of shaders is rejected.** It would break `vite-plugin-singlefile` delivery, make scene construction
   async and add a network failure mode.
4. **`vite-plugin-glsl` is deferred.** The trigger is the first GLSL chunk shared by two or more shader files. Today the
   only candidate is `hash12` in the nitrate pass, which has a single user.
5. **TSL (three.js Shading Language) is out of scope.** It is a WebGPU / node-material migration, not a string-handling
   choice.

## 2. Why — assessment of the common advice

The advice under review: "don't put shaders in template literals; use Vite `?raw`, Webpack `raw-loader`, or `fetch`".
Checked against primary sources on 2026-10-25. WebSearch was unavailable (the Bedrock proxy rejects the server-side
search tool), so these pages were fetched directly:

| Claim | Verdict | Source |
|---|---|---|
| Vite `?raw` imports a file as a string with no config | **Correct.** Docs: "Assets can be imported as strings using the `?raw` suffix", example `import shaderString from './shader.glsl?raw'`. Types come from `vite/client` (`declare module '*?raw'`), already referenced by `src/vite-env.d.ts`. Vitest runs the same Vite transform, so tests can import `?raw` too. | vite.dev/guide/assets |
| Webpack: install `raw-loader` | **Outdated.** Webpack 5 asset modules: "`asset/source` exports the source code of the asset. Previously achievable by using `raw-loader`." Not relevant here (Vite project). | webpack.js.org/guides/asset-modules |
| Buildless: `fetch()` at runtime | Works in general, **wrong for this repo** (see §1.3). | — |
| Template literals are bad practice | **Overstated.** three.js itself ships `ShaderChunk` as `.glsl.js` template strings, and `/* glsl */`-tagged literals get editor highlighting. Files pay off when shaders grow, get reused, or need tooling (lint, includes, minify). | three.js source |
| (omitted) `vite-plugin-glsl` | Adds recursive `#include` of chunk files, optional minify, HMR, and types (`"types": ["vite-plugin-glsl/ext"]`). Supports Vite 7 and is maintained. Worth it only once chunks are shared (§1.4). | github.com/UstymUkhman/vite-plugin-glsl |
| Example `attribute vec4 position;` | **Trap with `ShaderMaterial`.** `ShaderMaterial` prepends `position`, `uv` and the matrices itself, so redeclaring them fails to compile. Only `RawShaderMaterial` expects full declarations. | three.js docs |

Why move ours at all: `GatsbySceneManager.ts` is 767 LOC and listed as known debt in ADDENDUM-001 (CLAUDE.md §6: "do not
grow them, split them when touched substantively"). About 100 of those lines are GLSL. Moving them gives the shaders
real editor support (syntax, linting via a GLSL extension). It also gives ADDENDUM-022's R3F port one shared location
instead of a second copy.

## 3. Current state

`src/features/premiere/scene/GatsbySceneManager.ts`:

| Program | Lines | Uniforms (TS side) | Notes |
|---|---|---|---|
| `CinemaNitrateShader` (post pass) | 27–88 | `tDiffuse`, `uTime`, `uNitrate`, `uAspect` (module const) | `ShaderPass`; contains `hash12` |
| Green light | 318–349 | `greenLightUniforms`: `uTime`, `uIntensity` (private field, L123) | `ShaderMaterial`, additive |
| Gold dust | 379–416 | `dustUniforms`: `uTime`, `uCamZ` (private field, L128) | `ShaderMaterial` on `Points`; attributes `aScale`, `aPhase` |

## 4. Plan

Steps 1–3 land in one commit together with the implementation addendum (CLAUDE.md §1, §10).

1. **Create `src/features/premiere/scene/shaders/`** containing:
   - `cinemaNitrate.vert`, `cinemaNitrate.frag`
   - `greenLight.vert`, `greenLight.frag`
   - `goldDust.vert`, `goldDust.frag`
   - `uniforms.ts`: pure factories with no `three` import, e.g. `createGreenLightUniforms()` →
     `{ uTime: { value: 0 }, uIntensity: { value: 1 } }`. They return new objects on each call, with values identical
     to today's.
   - `index.ts`: a barrel that re-exports the `?raw` strings and the factories.

   GLSL is copied token-for-token. Only the template-literal leading indentation is removed, which is semantically
   inert in GLSL.
2. **`GatsbySceneManager.ts`:**
   - Replace the three literals with imports from `./shaders`.
   - `CinemaNitrateShader` keeps its shape (`{ uniforms, vertexShader, fragmentShader }`) so `new ShaderPass(...)` is
     unchanged.
   - The private uniform fields call the factories.

   Net change is about −100 LOC; nothing else in the class moves.
3. **`shaders/shaders.test.ts`** (Vitest, node), red first:
   - each imported source is a non-empty string containing `void main()`;
   - **uniform contract:** the set of `uniform <type> <name>;` names parsed from each vert + frag pair equals the
     key set of its factory. This catches renames on either side, which today fail silently as a black or static
     effect;
   - gold-dust vertex source declares exactly the attributes the geometry sets (`aScale`, `aPhase`).

   The parser is a small pure helper in `shaders/glslDeclarations.ts` with its own unit test. It matches declaration
   lines with a regex; the GLSL is ours, so no full parser is needed.
4. **Amend ADDENDUM-022 §2.3:** its "GLSL strings move verbatim to `scene3d/shaders/*.glsl.ts`" now reads: reuse
   `premiere/scene/shaders` (this addendum). This note is added in the implementation commit.
5. **Convention for future work** (to be added to CLAUDE.md §5 in the implementation commit): a full shader program
   lives in `.vert` / `.frag` beside its feature, imported via `?raw`, with a uniform-contract test. Chunk patches
   stay inline.

## 5. Practical impact / what a future reader must know

- **Delivery unchanged.** `?raw` compiles to a JS string export and `vite-plugin-singlefile` inlines it, so no separate
  shader asset is emitted.
- **Editor support:** `.vert` / `.frag` need a GLSL extension in VS Code (for example "Shader languages support").
  Without one they are plain text, which is no worse than today's literals.
- **No `#include` between our files** until `vite-plugin-glsl` is adopted (§1.4). Until then, duplicate a helper
  rather than string-concatenate in TS.
- **Visual likeness:** ADDENDUM-022's likeness principle (shaders byte-for-byte) is honoured at the token level. A
  shader *edit* is a visual change and needs its own addendum.
- **Rollback:** revert the single implementation commit.

## 6. Validation

**Performed for this plan:**
- read the shader sites and uniform objects listed in §3;
- confirmed `vite/client` declares `*?raw` (`node_modules/vite/client.d.ts:243`) and that `src/vite-env.d.ts`
  references it;
- fetched the Vite, Webpack and `vite-plugin-glsl` primary docs quoted in §2.

No code was changed.

**Planned for implementation:**
- `npx tsc --noEmit`, `npm test`, `npm run build`;
- `grep -c gl_PointCoord dist/index.html` ≥ 1 and no `*.frag` / `*.vert` in `dist/` (shaders inlined);
- a one-off check that the whitespace-normalised old literals equal the new file contents (recorded in the
  implementation addendum);
- browser check of the nitrate opening, the green light pulse and the dust twinkle, using Playwright (see T0 and T8
  below). Playwright is available in this environment (Chromium and WebKit builds are cached under
  `~/Library/Caches/ms-playwright`), so the "no browser" caveat no longer applies. The `playwright` package is not a
  project dependency, though. T0 decides how to run it without adding one silently.

## 7. Task list

Work one task at a time and tick it off here when done. Each task ends with `npx tsc --noEmit` and `npm test` green
unless it is docs-only.

- [x] **T0 — Playwright baseline (before any code change).** *Done: one-off `playwright@1.64.1` installed in
  `/tmp/claude-501/pw-tools` (nothing added to the repo); `capture.cjs` scrubs to 0.5/3/6.5/10/17/30 s on the dev server
  and also toggles the nitrate filter. The "before" frames and `console.log` are in `/tmp/claude-501/pw-shots/before`.
  Console baseline: only the `THREE.Clock` deprecation and SwiftShader `ReadPixels` stall warnings, no shader errors.
  Chromium needs the sandbox disabled to launch (macOS Mach-port rendezvous). The shaders animate on wall-clock
  `uTime`, so T8 compares visually or with a tolerance, not byte-for-byte.* Decide how to run Playwright: a one-off `npx
  playwright@<ver>` run with its output kept out of the repo, or a `devDependency` plus `e2e/` (which would be a
  decision that needs its own addendum and un-defers ADDENDUM-001's item). Using the swiftshader launch args from
  ADDENDUM-022 (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`), serve the current
  `npm run dev` or `dist/` build and capture "before" screenshots at fixed times: nitrate opening, green light visible,
  dust field. Capture the console output as well, to record any existing shader warnings.
- [x] **T1 — GLSL declaration parser (red then green).** *Done: `glslDeclarations.ts` + 6 tests (comments, qualifiers, multi-name declarations).* Add `shaders/glslDeclarations.ts` with a test: it extracts
  `uniform` names and `attribute` names from GLSL source, and ignores comments.
- [x] **T2 — Nitrate post pass.** *Done: `cinemaNitrate.vert/.frag`, `createCinemaNitrateUniforms()`, contract test written red first, then green.* Create `cinemaNitrate.vert` / `.frag` and `createCinemaNitrateUniforms()`. Write the
  uniform-contract test first (red). Wire `CinemaNitrateShader` in `GatsbySceneManager.ts` to the imports. `tDiffuse`
  stays in the uniforms.
- [x] **T3 — Green light.** *Done: `greenLight.vert/.frag`, `createGreenLightUniforms()`.* Same pattern: `greenLight.vert` / `.frag`, `createGreenLightUniforms()`, contract test,
  wire the manager (the `greenLightUniforms` field and the `ShaderMaterial` at the green-light mesh).
- [x] **T4 — Gold dust.** *Done: `goldDust.vert/.frag`, `createGoldDustUniforms()`, attribute test (`aPhase`, `aScale`).* Same pattern, plus the attribute contract (`aScale`, `aPhase`) against the geometry.
- [x] **T5 — Barrel and size check.** *Done: `shaders/index.ts` barrel; `GatsbySceneManager.ts` 767 → 649 LOC (−118); no `/* glsl */` left.* Add `shaders/index.ts`. Confirm `GatsbySceneManager.ts` shrank by about 100 LOC
  and has no leftover `/* glsl */` literals (`grep -n "glsl" GatsbySceneManager.ts` is empty).
- [x] **T6 — Full validation.** *Done: `tsc` clean, 431 tests pass (61 files), build OK; `gl_PointCoord` appears in `dist/index.html`, 0 `.frag`/`.vert` files in `dist/`.* `npx tsc --noEmit`, `npm test`, `npm run build`. Check `dist/index.html` contains
  `gl_PointCoord` and that `dist/` has no `.frag` / `.vert` files.
- [x] **T7 — Whitespace-normalised equality check.** *Done: all 6 old literals equal the new files after whitespace normalisation.* Compare the old literals (from `git show HEAD:...`) with the new
  file contents. Record the result.
- [x] **T8 — Playwright "after" run.** *Done: after-run console has no new lines (only the baseline `THREE.Clock` and SwiftShader `ReadPixels` warnings). Mean pixel difference before vs after was 4.8–15.9 per channel; two identical after runs differ by 6.1–11.2, so the change is inside the run-to-run noise from wall-clock `uTime` and particles. The after frames show the green beacon, diamond dust and the B&W nitrate grain and vignette. This is not a pixel-identical proof; T7 is the exactness proof.* Repeat T0's captures on the new build and compare with the "before" shots, plus
  console output (no new shader compile errors). Attach the result to the implementation addendum.
- [x] **T9 — Docs.** *Done: ADDENDUM-022 §2.3 amended, CLAUDE.md §5 convention added, ADDENDUM-026 written, register updated.* Amend ADDENDUM-022 §2.3, add the shader convention to CLAUDE.md §5, write the implementation
  addendum (the next free number), flip ADDENDUM-025 to "Implemented by …" in `docs/ADDENDA.md`.
- [x] **T10 — Commit.** *Done: one commit, path-limited so unrelated staged work stayed out.* One commit: imperative summary, what/why, a validation line that says what Playwright did and
  did not verify, and the attribution trailer.
