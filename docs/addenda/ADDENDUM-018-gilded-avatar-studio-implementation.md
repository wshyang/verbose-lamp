# ADDENDUM-018 — Gilded Avatar Studio: implementation record

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (visual system), §7 (interface surfaces); implements ADDENDUM-017. CLAUDE.md §1, §2, §5, §6, §7.
**Status:** Implemented — visual and in-browser model check pending (no browser in the sandbox).

## 1. What was built

Four features plus one shared module, exactly the layout of ADDENDUM-017 §3:

| Module | Contents |
|---|---|
| `src/shared/lib/raster/` | `RgbaImage`, `AlphaMask`, `RasterDimensions`, `SquareBox`; bilinear `cropSquare` / `resampleAlpha`; `solidAlpha`; `dilateAlpha` / `erodeAlpha` (new, see §2.4). `gilded-portrait/types.ts` re-exports the moved types; its snapshots are unchanged. |
| `src/features/face-detection/` | Pure `framing.ts` (`cropFromDetection`, `largestFace`, the reference constants) and the thin cached `locateFace.ts` loader (MediaPipe BlazeFace full range, confidence 0.5, never throws). |
| `src/features/background-removal/` | `matte.ts` (`planeOf`, `alphaOf`), `cutOut.ts` (reference port on the 128 grid), `subjectAlpha.ts`, the thin `segmentSubject.ts` loader (Transformers.js 4.3.0, `Xenova/modnet`, WASM only), and the deterministic hawker-centre fixture. |
| `src/features/enamel-backdrop/` | Continuous pattern fields (`sunburst`, `radiance`, `chevron`, `swirl`) behind one exhaustive switch, `goldLeaf.ts`, frozen palettes/presets/slider ranges, immutable spec edits, and `renderEnamelPanel` (image + wire + metal maps). |
| `src/features/avatar-studio/` | Pure `compose.ts`, `frame.ts`, `stage.ts`, `cropBox.ts`; `data/samples.ts` with the bundled `assets/wei-ling.jpg`; hooks `usePhotoSession`, `useAvatarLook`, `useAvatarStudio`, `useCropper`; components (modal, preview pane, cropper, backdrop / cut-out / subject controls, launcher). |

Host wiring: `<AvatarStudioLauncher />` after `<QrGeneratorLauncher />` in `PremiereHeader.tsx` (one import, one element).

## 2. Deviations from ADDENDUM-017 (and why)

1. **Working base.** `main` was cloned into the workspace. The plan's own branch (`docs/addendum-017-gilded-avatar-studio-plan`) additionally carries a `3 avatar studios/` folder (~7,000 reference files); it was read from a temporary extraction, not merged, so it neither enters the tree nor Tailwind's source scan. ADDENDUM-019 records what was lifted from it.
2. **Tooling.** `main` had no `.gitignore` (so `node_modules/` showed as untracked); one was added (`node_modules/`, `dist/`, `.DS_Store`, `*.local`). `vitest.config.ts` gained the `@` alias that `vite.config.ts` already has, so tested pure modules can import feature barrels (CLAUDE.md §6); `vite.config.ts` is untouched. `src/vite-env.d.ts` (`vite/client`) makes the `.jpg` import type-check with `types: ["node"]` — no `declare module` was needed. The JPEG was re-encoded with ImageMagick (`sips` is macOS-only): 478×640, quality 82, **80,574 bytes**.
3. **Face detection contract.** MediaPipe reports keypoints normalised but the bounding box **in pixels**; the plan said "normalised 0–1" for both. The reference math (and ours) uses pixel boxes, so the types document the real shape. `detect()` returns `{ detections }` as MediaPipe does. `locateFace(image, { load, toSource })` takes a typed options object instead of `load?` so the success path is testable without a DOM (`toSource` defaults to the canvas builder).
4. **Morphology in `shared/lib/raster`.** The outline needs dilation and the edge knob needs both directions; `chokeMask` only erodes. `dilateAlpha` / `erodeAlpha` clip their window to the raster, so the border is never eaten.
5. **`subjectAlpha` blend.** `alpha = shapedMatte × gate`, where the gate is the tuned grid scaled up and feathered by half a cell with `boxBlur` (clamped 0–1), pruned cells are forced to 0, and the edge knob also erodes/dilates the matte by whole cells so "Grow" can reveal photo beyond the matte. All five required properties are tested. `gridFromMatte` keeps the reference's optional crop `box` (default: the whole matte).
6. **Pattern signature.** `fieldAt(point, { size, bands }, pattern)`: the sunburst and swirl fields depend on the band count, and CLAUDE.md caps parameters at three. Fields reproduce the copied reference band functions **exactly** on the 128 grid (9 variants, every third cell).
7. **Wires measured in pixels.** Edge distance is divided by the field's finite-difference gradient (taking the gentler one-sided step, so the atan2 seam is skipped), giving cloison wires of uniform width; `wireWidth` is in reference-grid cells so 512 and 16 px renders match in proportion. Wires are anti-aliased by coverage.
8. **Frame.** The medallion's alpha and rim come from one analytic radius instead of `buildShapeMask`, so edge and rim are exactly concentric and equally anti-aliased. The plaque has a stepped bezel.
9. **Outline.** Measured from the subject's visible extent (alpha ≥ 24), dilated ≈ 1.2 % of the edge, softened, and painted **over** the composite. The first version dilated the 50 % contour beneath the subject; the render check showed the soft fringe buried it, and the outline test caught the same thing.
10. **Session.** The stage is derived, not stored: `refining` means "face known, matte pending". The photo is drawn from pixels, so there are no object URLs to revoke. Cancel in the `cropping` stage discards the photo; in "Adjust framing" it only closes the cropper. The modal body mounts only while open, so models warm up when the studio opens.
11. **Reuse.** `GildedPortraitCanvas` gained an optional `testId` (default unchanged) so the studio keeps its `avatar-studio__*` convention.

## 3. Licences and network (checked, not assumed)

- `curl -sIL` → HTTP 200 for `@mediapipe/tasks-vision@1.0.1`, `@huggingface/transformers@4.3.0`, the full-range BlazeFace float16 model, and `huggingface.co/Xenova/modnet` config. Both libraries are served as ESM (`FaceDetector` / `FilesetResolver` exports present).
- `package.json` on jsdelivr: tasks-vision **Apache-2.0**, transformers **Apache-2.0**. BlazeFace and MODNet are recorded as Apache-2.0 per ADDENDUM-017; their model cards were not re-read here.

## 4. Measurements

- Tests: 18 files / 159 tests → **24 files / 220 tests**, all passing. New snapshots: four 16×16 enamel presets and one 16×16 composition (data rows, not screen pixels).
- Build (single file): **1,016.80 kB → 1,178.57 kB** (gzip 277.06 → 377.70 kB); the inlined JPEG accounts for ~107 kB of it. Models are not bundled.
- Node timings in this sandbox at 512²: backdrop 110–160 ms, cut-out + finish 77–104 ms, composite ≈ 100 ms. Backdrop and cut-out are memoised apart. If sliders feel slow in a browser, apply ADDENDUM-017 §7's settled-preview idea.

## 5. Validation

`npx tsc --noEmit` ✓ · `npm test` ✓ · `npm run build` ✓. A temporary Node render check (PNG via `zlib`) produced the four presets and a composed avatar; inspected: gold wires between coloured enamel bands, leaf flecks, medallion rim, and (after the fix in §2.9) a solid gold outline. **Browser not available in sandbox:** face detection, MODNet on the Wei_Ling photo, the sheen, and the layout are visually unverified. To check: `npm run dev` → **Avatar Studio → Show Wei_Ling**; confirm her face is framed, the diner behind her is removed, the backdrop is coloured gold with wires and leaf, the outline is present, Gild subject works, and the PNG downloads.
