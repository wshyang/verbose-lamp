# ADDENDUM-017 — Gilded Avatar Studio: face detection, background removal, enamel-gold backdrops (assessment and plan)

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (visual system, palette), §7 (interface surfaces); CLAUDE.md §1, §2, §5, §6. Un-defers ADDENDUM-015 §5 (background removal).
**Status:** Accepted (plan). Not implemented yet. The implementation record will be ADDENDUM-018.
**Audience:** the agent doing the implementation. Read this whole file before writing code.

---

## 0. First step for the implementer (before any code)

1. Save this plan in the repo as `docs/addenda/ADDENDUM-017-gilded-avatar-studio-assessment-and-plan.md` and add its row to `docs/ADDENDA.md`:
   `| [ADDENDUM-017](addenda/ADDENDUM-017-gilded-avatar-studio-assessment-and-plan.md) | 2026-10-24 | Gilded Avatar Studio: face detection, background removal, enamel-gold backdrops | §3, §7 | Accepted (plan) |`
2. Commit (`docs: plan gilded avatar studio port (ADDENDUM-017)`). CLAUDE.md §10 says to commit before a risky change.

## 1. Context

The user wants three features from the reference app in `tmp/special-fiesta/` ported here, kept modular and reusable. The reference is a sports-day PWA, a very different app.

1. **Face detection.** Find the face in a photo and frame a square avatar crop around it.
2. **Avatar studio.** The reference paints coloured pattern backdrops (spiral, concentric, waves, psychedelic) behind the avatar. Here the backdrop must **keep its colour but read as shimmering gold**, like gold art pieces with colour worked into them: cloisonné enamel, Klimt gold leaf, Art Deco lacquer-and-gilt panels.
3. **Background removal** after face detection, so the person sits on that backdrop.

Also: **a button that shows the avatar of `Wei_Ling`** (demo participant #1 in the reference app) in our gold avatar studio.

Decisions confirmed with the user:
- **Subject render:** the person keeps the photo's natural colour by default. A "Gild subject" toggle runs the existing `gildImage` pipeline on the cut-out. A gold outline goes around the person in both modes.
- **Entry points:** a **header "Avatar Studio" launcher** next to Golden QR, **plus an in-studio "Show Wei_Ling" button** that runs the full pipeline on her photo.

## 2. Assessment — what the reference does

Paths below are relative to `tmp/special-fiesta/apps/web/src/`.

| Reference file | What it does | Port decision |
|---|---|---|
| `lib/avatar/locateFace.ts` | Face detection with MediaPipe `FaceDetector`, BlazeFace **full-range** model. The reference measured full-range at 13/14 hits on its photos, against 7/14 for short-range. Settings: `minDetectionConfidence 0.5`. Loaded from a CDN with `import(/* @vite-ignore */ url)`. The detector promise is cached, `warmUp…()` starts the download when the studio opens, and the function never throws (null means "ask the user to place the square"). Crop math: size = inter-ocular distance × 3.65/0.72, with a minimum of `bbox.height × 1.45 / 0.72`; eyes sit 52 % down; the square is capped at the photo's **shortest** edge; the largest face wins. | **Port almost unchanged.** Split into a pure, tested `cropFromDetection` and a thin loader. |
| `lib/avatar/segmentPhoto.ts` | Background removal with Transformers.js `@4.3.0` from jsdelivr: `pipeline('background-removal', 'Xenova/modnet', { device: 'wasm' })`. WebGPU is deliberately off because it put holes in faces (ADR-221). Reads both result shapes (`RawImage` alpha channel or `[{ mask }]`). Never throws. | **Port.** Pure, tested `planeOf` / `alphaOf` plus a thin loader. Keep WASM only and the pinned version. |
| `lib/avatar/cutOut.ts` | Turns the matte (the model's alpha mask) into a 128×128 grid of keep/remove cells. `maskFromModel`: a cell is background when its average alpha is below a threshold. `trimEdge`: erode or grow the subject by up to 2 cells. `pruneIslands`: drop connected pieces of `minIsland` cells or fewer, unless they contain the seed cell between the eyes at `(size/2, 0.52·size)`; if no piece holds the seed, keep the largest. Defaults: `threshold 128, minIsland 512, edge 0, removeBackground true`. Named steps: Loose/Normal/Tight, Keep/Remove, Trim/As-is/Grow. Order: threshold → trim → prune. | **Port unchanged** on the **same 128 grid**, so the reference's measured numbers still hold (largest stray piece 80 cells, smallest real subject 5788, `minIsland 512`). `Wei_Ling`'s photo is the case `pruneIslands` was written for: another diner's head is behind hers (reference `docs/addenda/ADDENDA.md` around line 2388). |
| `lib/avatar/cropBox.ts` | Pure square-in-rectangle math for the manual cropper: `clampBox`, `startingBox`, `moveBox`, `resizeBox`, `boxToPhoto`, `photoToBox`. Minimum size is 20 % of the short edge. | **Port unchanged**, with tests. |
| `components/participant/PhotoCropper.tsx` | Draggable, resizable square using pointer events. Starts on the detector's box. Reports the box on pointer-up only. | **Port, restyled in gold.** Keep the component thin. |
| `components/participant/usePhotoSession.ts` | Session state machine: `idle → working → refining → refined/plain/cropping/failed`. A session counter makes results that arrive after Cancel get ignored. Object URLs are revoked in effect cleanup. Models warm up on mount. | **Port the pattern** into our hook. |
| `components/participant/CutOutControls.tsx` | "Take it out / Leave it in", three rows of named steps, "Fine tune" sliders, "Back to normal". Hides the threshold row when there is no matte. | **Port the UX**, gold-styled, using our shared `Button` / `RangeInput`. |
| `lib/avatar/sunburst.ts`, `concentric.ts`, `waves.ts`, `psychedelic.ts`, plus `packages/contracts/src/schemas.ts` lines 219–430 | Four backdrop patterns. Each is a function that gives every cell a band index. Spiral: angle `θ + r·twist·0.006`, split into rays. Concentric: Minkowski p-norm distance times a rose term. Waves: stripes displaced by a triangle or sine wave, amplitude given as a fraction of the period. Psychedelic: domain warp, capped at `w·f² ≤ 0.8`, arms = swirl × bands. Each uses two colours, interpolates the bands between them, and allows 2–4 bands. Ranges are in `schemas.ts`. | **Port the math**, but make each function return a **continuous field value** (band = `floor(field) mod bands`). That also gives the distance to the nearest band edge, which is where the gold wires go. Keep the reference's ranges and defaults. |
| `lib/avatar/photoSprite.ts` (582 LOC), the colour-rule cut-out, `readPhoto.detectFaceBox` (Shape Detection API) | 128×128 pixel-art palette sprites and a colour-based background guess. | **Not ported.** Our output is a full-resolution gold image, not a pixel sprite. When there is no matte we fall back honestly (§4.4), not to a colour guess. |

Licences (verify during implementation and record in ADDENDUM-018): `@mediapipe/tasks-vision` Apache-2.0, BlazeFace model Apache-2.0, `@huggingface/transformers` Apache-2.0, MODNet Apache-2.0. Nothing AGPL or non-commercial is used, which settles the concern in ADDENDUM-015 §5.

### What we already have (reuse it, do not re-implement)

From `src/features/gilded-portrait/` (import from the barrel `@/features/gilded-portrait`):
- Types `RgbaImage`, `AlphaMask`, `GildingParams`; `gildImage(image, params)`; `GILDING_PRESETS`.
- `GOLD_RAMPS` + `buildGoldRampLut(stops)`: the gold colour for wires, rims, the outline and gilt.
- `boxBlur`, `toLuminance` (`tone.ts`); `buildShapeMask` (oval medallion) and `chokeMask` (`mask.ts`).
- `validateImageFile`, `loadRgbaImage` (scales to ≤ 1024 px and turns decode errors into user-facing copy).
- `GildedPortraitCanvas`: a canvas plus the 8 s `.gilded-portrait-sheen` sweep, which respects reduced motion. This **is** the shimmer.
- `downloadGildedPng(image, label)`, which uses `toSafeFileStem` from `@/features/qr-generator`.

From `src/shared/ui/`: `Button`, `IconButton`, `RangeInput`, `Dialog` (portal, Escape, focus, key propagation).
Modal styling: copy the `CHIP_*`, `LABEL` and `ACTION` class strings and the corner-bracket frame from `GildedPortraitModal.tsx`.
Launcher pattern: `src/features/qr-generator/QrGeneratorLauncher.tsx`.

## 3. Module layout — four features, each with a barrel

Feature-first, per CLAUDE.md §6 and `docs/ARCHITECTURE.md`. The first three features have **no React and no knowledge of this app**, so another app can take any one of them on its own. Limits for every file: ≤ 400 LOC; functions ≤ 50 lines (aim for 20); ≤ 3 parameters, otherwise a typed object; no boolean flag parameters; never mutate inputs.

### 3.0 Shared raster primitives — `src/shared/lib/raster/`

All four features need these. Putting them here stops face-detection from importing gilded-portrait just for a type.
- `types.ts`: move `RgbaImage`, `AlphaMask` and `RasterDimensions` here, and add `SquareBox { x, y, size }` (the reference's `CropBox`). `gilded-portrait/types.ts` **re-exports** them, so its public API and snapshots do not change.
- `resample.ts` + test: `cropSquare(image, box, outSize): RgbaImage` (bilinear) and `resampleAlpha(mask, box, outSize): AlphaMask` (bilinear, so the matte lines up with the cropped photo).
- `index.ts` barrel.

### 3.1 `src/features/face-detection/`

- `types.ts`: `FaceKeypoint`; `FaceDetection { boundingBox?, keypoints? }`, normalised 0–1, in BlazeFace keypoint order (right eye, left eye, nose, mouth, ears); `FaceDetector { detect(image): FaceDetection[] }`; `TasksVisionModule`; `TasksVisionLoader`.
- `framing.ts` + `framing.test.ts` (pure): constants `CROP_PER_INTER_OCULAR = 3.65/0.72`, `EYE_LINE = 0.52`, `HEAD_OVER_FACE = 1.45`, `HEAD_SHARE = 0.72`; functions `largestFace(detections)` and `cropFromDetection(face, frame): SquareBox | null`.
- `locateFace.ts` (thin): `TASKS_VISION_URL`, `WASM_ROOT`, `MODEL_URL` (full-range float16), `MIN_CONFIDENCE = 0.5`. Cached `detectorFor(load)`, `warmUpFaceLocator(load?)`, `forgetFaceLocator()`, and `locateFace(image, load?): Promise<SquareBox | null>`. It builds a canvas from the `RgbaImage` with `createImageData` and never throws.
- `index.ts` barrel.

### 3.2 `src/features/background-removal/`

- `types.ts`: `SubjectMatte` (an `AlphaMask`, 0 = background, 255 = subject), `CutOutTuning`, `TuningKnob`, `TransformersModule`, `TransformersLoader`.
- `matte.ts` + test (pure): `planeOf(result)` and `alphaOf(plane)`. Handles 1- and 4-channel results; anything else returns null.
- `cutOut.ts` + test (pure, ported from the reference): `DEFAULT_TUNING`, `TUNING_BOUNDS`, `CUT_OUT_STEPS`, `withKnob`, `withBackground`, `DECISION_GRID = 128`, `gridFromMatte(matte, grid)`, `trimEdge`, `pruneIslands`, `componentSizesOf`, `tunedGrid(grid, size, tuning)`.
- `subjectAlpha.ts` + test (pure): `subjectAlpha({ matte, grid, tuning, outSize }): AlphaMask`. Each pixel keeps the matte's own soft edge, **gated** by the tuned 128 grid (scaled up, then feathered by about half a cell with `boxBlur`). The exact blend is your call, but it must pass these tests:
  - pruned islands end at alpha 0;
  - the main subject keeps the matte's alpha;
  - raising the threshold never grows the subject;
  - `edge −1` shrinks the subject and `+1` grows it;
  - `removeBackground: false` gives alpha 255 everywhere.
- `segmentSubject.ts` (thin): `TRANSFORMERS_URL` (`@huggingface/transformers@4.3.0`), `MODEL = 'Xenova/modnet'`, WASM device, cached. Exports `warmUpSegmenter()`, `forgetSegmenter()` and `segmentSubject(image, load?): Promise<SubjectMatte | null>`, which never throws.
- `index.ts` barrel.

### 3.3 `src/features/enamel-backdrop/` — the "coloured but shimmering gold" backdrop

The look is a **cloisonné or gilt-enamel panel**. Each pattern band is a field of coloured enamel. Band boundaries are raised **gold wires**. The enamel carries **gold-leaf flecks** and a warm gilt glaze. A soft radial highlight lights the panel and the existing CSS sheen sweeps across it. The colours stay vivid, and gold appears wherever two bands meet.

- `types.ts`:
  - `BackdropPattern`, a discriminated union of `SunburstPattern | RadiancePattern | ChevronPattern | SwirlPattern`. The kinds are `'sunburst' | 'radiance' | 'chevron' | 'swirl'`, matching the reference's spiral, concentric, waves and psychedelic, with the same fields and ranges as `schemas.ts`.
  - `EnamelPalette { id, name, colourOne, colourTwo, ground }`.
  - `BackdropSpec { pattern, colourOne, colourTwo, bands, gilt (0–1), wireWidth, leafDensity, rampId }`.
- `patterns/sunburst.ts`, `radiance.ts`, `chevron.ts`, `swirl.ts`, with one shared `patterns.test.ts`. Each exports `fieldAt(point, size, pattern): number` in **unit space**, so a 512 px render and a 128 px preview look the same. `patterns/index.ts` holds the **only** switch over `kind`. It is exhaustive, so a new kind that is not wired in fails to compile (reference ADR-207). It also exports `bandOf(field, bands)` and `edgeDistance(field) = min(frac, 1 − frac)`.
- `palettes.ts` (frozen, `as const`): five Jazz-Age enamel palettes, for example:
  - **Emerald Ballroom** (`#0f5c4a`/`#1f8a70`)
  - **Daisy's Sapphire** (`#163a7a`/`#3a74c4`)
  - **Gatsby Ruby** (`#7a1424`/`#b8323f`)
  - **Klimt Leaf** (`#7a5a12`/`#1e6b6b`)
  - **Midnight Jet** (`#0b0a10`/`#2b2340`)

  Plus `DEFAULT_BACKDROPS`, one named preset per pattern.
- `goldLeaf.ts` + test (pure): deterministic hashed value noise, `leafAt(x, y, seed)`, for the flecks. The same input always gives the same output.
- `renderBackdrop.ts` + test (pure): `renderEnamelBackdrop(spec, size): RgbaImage`. Steps for each pixel:
  1. Compute the field value, then the band.
  2. Pick the enamel colour, interpolated between `colourOne` and `colourTwo` across the bands (as in reference ADR-206).
  3. Glaze toward gold by `gilt`.
  4. Add gold-leaf flecks.
  5. **Wire:** if `edgeDistance < wireWidth`, take the colour from `buildGoldRampLut`, sampled along a bevel profile so the wire is brightest at its centre.
  6. Apply the radial light.

  Split this into small helpers to stay under 50 lines per function.
- `index.ts` barrel.

### 3.4 `src/features/avatar-studio/` — composition, state, UI

Pure layer:
- `types.ts`: `SubjectFinish = 'natural' | 'gilded'`, `AvatarFrame = 'medallion' | 'plaque'`, the `AvatarComposition` input type, and `StudioStage = 'idle' | 'working' | 'refining' | 'ready' | 'plain' | 'cropping' | 'failed'`.
- `compose.ts` + test: `composeAvatar(input): RgbaImage`, with `AVATAR_SIZE = 512`. It never mutates its input. Steps:
  1. `cropSquare` the photo.
  2. Compute `subjectAlpha`, or alpha 255 everywhere when there is no matte.
  3. Take the subject pixels as they are (`natural`), or run `gildImage` with a `GILDING_PRESETS` entry (`gilded`).
  4. `renderEnamelBackdrop`.
  5. **Gold outline:** grow the alpha by N px, subtract the original alpha, and paint that ring with the gold ramp.
  6. Alpha-composite the layers.
  7. Apply the frame: a medallion (`buildShapeMask` oval plus a gold rim) or a square plaque.
- `stage.ts` + test: `nextStage({ hasImage, crop, matte })`, plus the user-facing hint for each stage. The copy must not mention internals (CLAUDE.md §5). Examples:
  - `ready`: "Background removed. Move the square if the framing is off."
  - `plain`: "The background could not be removed here — showing the full photo."
  - `cropping`: "We could not find a face. Place the square over it."
- `cropBox.ts` + test: the reference `cropBox.ts`, ported and typed on `SquareBox`.
- `data/samples.ts`: `AVATAR_SAMPLES` `as const`, containing `{ id: 'wei-ling', name: 'Wei_Ling', persona: 'Kaya-toast powered sprinter', src: weiLingUrl }`. The persona text comes from `tmp/special-fiesta/scripts/demo-personas.json`.
- `assets/wei-ling.jpg`: made from `tmp/special-fiesta/images/ingest/social-01-female.png` (478×640, 562 KB PNG). Re-encode it once so the single-file build stays small: `sips -s format jpeg -s formatOptions 82 <src> --out src/features/avatar-studio/assets/wei-ling.jpg`. Aim for under 90 KB. The single-file Vite plugin inlines it as a data URL.
- `src/vite-env.d.ts`: `/// <reference types="vite/client" />`, so the `.jpg` import type-checks. Today `tsconfig` `types` is only `["node"]`. Confirm this works; if it does not, add `declare module '*.jpg'`.

Hooks (they make the decisions; no JSX):
- `usePhotoSession.ts`: the ported session pattern. It holds the session counter, stage, chosen image, found box, matte and crop box. Exposes `loadFile(file)`, `loadSample(sample)` (fetches the data URL to a Blob and takes the same path), `setCrop` and `cancel`. It warms up both models on mount and revokes object URLs. Flow: validate → `loadRgbaImage` → stage `working` → run `locateFace` and `segmentSubject` in parallel → set the stage with `nextStage`.
- `useAvatarLook.ts`: holds the backdrop spec, palette, pattern knobs, cut-out tuning (`withKnob` / `withBackground`), subject finish, frame shape and shimmer toggle.
- `useAvatarStudio.ts`: combines the two hooks. It memoises `renderEnamelBackdrop(spec)` separately from `composeAvatar(...)`, so a pattern tweak does not redo the cut-out and a cut-out tweak does not redo the pattern. `downloadPng()` calls `downloadGildedPng(image, '<name>-gilded-avatar')`.

Components (render only; no `.filter/.find/.sort/.reduce` inside JSX):
- `AvatarStudioModal.tsx`: two panes, like `GildedPortraitModal`.
  - Left: the preview (`GildedPortraitCanvas`, for the sheen) and the source actions: Choose image, **Show Wei_Ling**, Download PNG.
  - Right: `BackdropControls`, `CutOutControls`, `SubjectControls`.

  Split into sub-components and files to stay under 400 LOC.
- `PhotoCropper.tsx`: the ported square cropper. Shown in the `cropping` stage and from "Adjust framing".
- `BackdropControls.tsx`: pattern chips, palette chips (gradient swatches), two colour inputs, bands, per-pattern knobs (sliders using the reference ranges), gilt, wire width, leaf density.
- `CutOutControls.tsx`: Take it out / Leave it in, the named steps, Fine tune sliders, Back to normal.
- `SubjectControls.tsx`: Natural / Gilded subject, Medallion / Plaque, Sheen.
- `AvatarStudioLauncher.tsx`: the header button, with the lucide `UserRound` or `Sparkles` icon. Label "Avatar Studio", or "Avatar" on small screens.
- `index.ts` barrel: exports the pure API, the hooks, the modal and the launcher.

**Host wiring.** This is the only change outside the new features, apart from §3.0 and the docs: in `src/app/components/PremiereHeader.tsx`, add `<AvatarStudioLauncher />` after `<QrGeneratorLauncher />`.

### Test IDs (`avatar-studio__{role}`)

`launch`, `overlay` (the dialog backdrop; not `backdrop`, which here means the pattern), `close`, `file-input`, `choose-image`, `sample-wei-ling`, `preview`, `state`, `adjust-framing`, `crop-square`, `crop-confirm`, `crop-cancel`, `pattern`, `palette`, `colour-one`, `colour-two`, `bands`, `pattern-knob` (the repeated sliders share it), `gilt`, `wire-width`, `leaf-density`, `cut-background`, `cut-threshold`, `cut-strays`, `cut-edge`, `cut-fine-toggle`, `cut-reset`, `subject-finish`, `frame-shape`, `shimmer`, `download-png`.

## 4. Behaviour details

1. **Order:** load → detect the face and segment in parallel → framed crop → cut-out → compose. Face detection and segmentation are independent; either can fail without stopping the other (reference ADR-054).
2. **Warm-up:** both models start downloading when the studio opens. Failures during warm-up are silent.
3. **No face found:** stage `cropping`. The cropper opens at `startingBox` and the user confirms the square.
4. **No matte** (offline, CDN blocked, model error): stage `plain`. The cut-out controls are disabled and show the `plain` hint. The avatar still composes: the full crop inside the medallion, with the gold rim. There is no colour-guess fallback.
5. **Cancel, or a new photo while a run is in progress:** bump the session counter so late results are dropped.
6. **Wei_Ling button:** loads the bundled asset through the same session path as an upload. Defaults: **Sunburst / Emerald Ballroom** backdrop, natural finish, medallion. Her photo has a second person behind her head. The default `minIsland 512` should remove that person, which is the visible proof that pruning works.
7. **Privacy:** the photo never leaves the browser. On first use, model weights and WASM download from `cdn.jsdelivr.net`, `huggingface.co` and `storage.googleapis.com`. The modal says in plain words that the first run downloads the face and background tools, without naming URLs or libraries.
8. **Shimmer:** the preview sheen is the existing `.gilded-portrait-sheen` over the canvas. The PNG export is the still image, the same rule as ADDENDUM-016.

## 5. Tests (write them first — CLAUDE.md §2)

Fixtures use deterministic synthetic data only, one `fixtures.ts` per feature:
- a 64×48 "hawker-centre" frame with a lit face disc, a detached second head blob, and a matching synthetic matte;
- a fake `TasksVisionModule` and `TransformersModule` that return canned detections and mattes.

Reuse `buildStudioPortraitFixture` from gilded-portrait where it fits. Tests use no binary fixtures; the Wei_Ling JPEG is a runtime asset only.

- `shared/lib/raster/resample.test`: 1:1 gives the identical image; output has the requested size; edges clamp; the input is untouched.
- `face-detection/framing.test`:
  - eyes land on the eye line;
  - crop size scales with inter-ocular distance;
  - the bbox minimum applies to profile faces;
  - on 640×480 the square is capped at the shortest edge;
  - the largest of several faces wins;
  - null when eyes are missing or degenerate.

  `locateFace` with a fake loader: success; loader rejects → null; detector throws → null, and a later call can retry.
- `background-removal/matte.test`: both result shapes; a channel-count mismatch → null.
- `background-removal/cutOut.test`: port the reference `cutOut.test.ts` cases: threshold, trim in both directions, prune keeps the seed component, fallback to the largest piece, trim runs before prune, `withKnob` clamps.
- `background-removal/subjectAlpha.test`: the five properties listed in §3.2. The detached blob in the fixture ends at alpha 0.
- `enamel-backdrop/patterns.test`:
  - for a sweep of cells, each `bandOf(fieldAt(...))` equals the reference band function (copy the reference formulas into the test as the oracle);
  - the psychedelic pattern is mirror-symmetric about y = x;
  - waves with amplitude 0 give horizontal stripes;
  - band indices are always in `[0, bands)`.
- `enamel-backdrop/renderBackdrop.test`:
  - output is deterministic;
  - every wire pixel is warm gold (R ≥ G ≥ B);
  - enamel bands keep their hue family;
  - moving `gilt` from 0 to 1 shifts colours toward gold;
  - a **data snapshot** of a 16×16 render for each default preset (data, not screen pixels).
- `avatar-studio/compose.test`:
  - output is 512² (tests may pass a smaller `size` override);
  - the input is untouched;
  - alpha is 0 outside the medallion;
  - the pruned blob shows backdrop, not photo;
  - natural and gilded differ only inside the subject;
  - the outline ring is gold;
  - a snapshot of a 16×16 composition.
- `avatar-studio/stage.test` and `avatar-studio/cropBox.test` (ported).

## 6. Implementation order (commit after each green step)

1. Do §0: save the addendum, add the register row, commit.
2. Add `shared/lib/raster` and the re-export from gilded-portrait. `npm test` must still pass with **unchanged** snapshots.
3. `face-detection`, tests first.
4. `background-removal`, tests first.
5. `enamel-backdrop`, tests first.
6. The `avatar-studio` pure layer (`compose`, `stage`, `cropBox`), tests first.
7. The asset, `vite-env.d.ts` and `samples.ts`.
8. Hooks, then components, then the launcher; mount it in `PremiereHeader.tsx`.
9. Docs:
   - update `docs/ARCHITECTURE.md`: the module map and ownership bullets for the four new features and `shared/lib/raster`;
   - write `ADDENDUM-018`, the implementation record (deviations from this plan, licences checked, bundle size before and after, timings), and add its register row.

## 7. Risks and what a future reader must know

- **Network dependency:** face detection and background removal need a first-run download of several MB, which the browser then caches. Offline, the studio still works with manual framing and no cut-out.
- **Pinned CDN URLs** are copied from the reference: `@huggingface/transformers@4.3.0`, `@mediapipe/tasks-vision@1.0.1`, full-range BlazeFace float16. Before relying on them, check each one resolves with `curl -sI <url>`. If the sandbox blocks the network, say so in ADDENDUM-018 and keep the reference's versions.
- **Bundle size:** the single-file build is about 991 kB today. The inlined JPEG adds about 100 kB of base64. The models are not bundled.
- **CPU cost:** composing at 512², plus `gildImage`, should take tens of ms. Backdrop and cut-out are memoised separately. If sliders feel slow in a browser, render a 256² preview while dragging and 512² on release (the reference's "settled tuning" idea), and record that in ADDENDUM-018.
- **Known debt:** none of the existing over-limit files listed in ADDENDUM-001 are touched, except for one added line in `PremiereHeader.tsx`.

## 8. Verification

- Run `npx tsc --noEmit`, `npm test` and `npm run build`. All must pass. Report test counts and build size.
- Render check in Node (there is no browser here): write a small script under `$TMPDIR` that runs `renderEnamelBackdrop` for each default preset and `composeAvatar` on the synthetic fixture, and writes PNGs with Node's `zlib` (as ADDENDUM-016 did). Inspect them for gold wires, coloured enamel, the outline and the medallion rim.
- Node cannot decode `wei-ling.jpg` without an image decoder, and none should be added. Face detection and MODNet on real photos only run in a browser.
- Commit caveat (CLAUDE.md §7, §10): `Validation: tsc ✓ vitest ✓ build ✓ — browser not available in sandbox`.
- Until someone checks in a browser, face detection, background removal on the Wei_Ling photo, the sheen and the layout are **visually unverified**. To check: run `npm run dev`, click **Avatar Studio → Show Wei_Ling**, and confirm:
  - her face is framed;
  - the person behind her is removed;
  - the backdrop is coloured gold, with wires and leaf;
  - the gold outline is there;
  - the Gild subject toggle works;
  - the PNG downloads.
