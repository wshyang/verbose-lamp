# ADDENDUM-017 - Gold Avatar Studio: porting face detection, the avatar studio, and background removal

**Date:** 2026-10-24; relates to BUILD_PROMPT sections 3, 6 and 7; CLAUDE.md sections 1, 2, 5, 6 and 10
**Status:** Implemented - browser visual verification pending.

## 1. What was decided

The reference application under `tmp/special-fiesta/` (the PSD Active Day beach app) has
three things the Great Gatsby premiere did not have: a **face detector**, an **avatar
studio**, and **background removal**. All three are ported across, in one new
self-contained feature, and re-expressed in the house's gold.

The feature lives at `src/features/avatar-studio/` and is mounted by the Gatsby host,
unlike `gilded-portrait`, which remains exported but unmounted. It is mounted because
the brief asks for a visible control: the premiere header now carries **Avatar Studio**
and **Wei_Ling** buttons.

### The three ported capabilities

| Capability | Source | Here |
|---|---|---|
| Face detection | BlazeFace full-range over `@mediapipe/tasks-vision` from a CDN | `engine/faceDetection.ts`, plus an offline skin-tone estimate in `engine/faceCrop.ts` |
| Avatar studio | Sprite grid, four backdrop patterns, live preview | `engine/portraitGrid.ts`, `engine/backdropArt.ts`, `engine/goldStudio.ts`, `components/AvatarStudioModal.tsx` |
| Background removal | MODNET over `@huggingface/transformers` from a CDN | `engine/subjectSegmentation.ts`, `engine/matte.ts` |

### The house change: colour plus shimmering gold

The source app's backdrop was flat psychedelic colour on a plain ground. Here the
ground is **gold**, and the pattern's bands are **enamel inlaid into a gold plate**:
even bands read as inlay, odd bands as gilded metal, a specular sweep crosses both the
way light crosses finished metalwork, and a raised gold rim can close the edge. The
geometry is the source app's, unchanged; the paint is ours.

The gold itself is not reinvented. `GOLD_RAMPS` and `buildGoldRampLut` are reached
through the `gilded-portrait` barrel, so one house owns one ramp.

## 2. Why

- **Reuse over reinvention.** The source app's four pattern generators, its island
  pruning, its eye-line crop arithmetic and its sprite codec are measured, tested
  geometry. Porting them keeps the measurements and throws away nothing.
- **Gold is the house's material.** BUILD_PROMPT section 3 fixes a shimmering-gold
  visual system. A colour-only backdrop would break it; colour *over* gold does not.
- **One plate, two doors.** The studio takes a photograph the visitor brings, or the
  house portrait. Both go through the same grid and the same gold plate, so the second
  door costs no extra code.

## 3. Deviations from the source app, and why

1. **The estimate is kept, not replaced.** The source app asked the participant to
   place the square by hand when no face was found. Here the skin-tone estimate is
   kept and *labelled an estimate*, and the copy tells the visitor to crop the
   photograph to the head. A visitor who has already cropped gets a good portrait
   without a manual step.
2. **The ink contour belongs to the sitter.** A photo sprite's palette is
   `[...photo colours, backdrop, ink]`, and the source app counted the ink as ground
   when it tested the matte. Here the ink is the edge of the person and is kept, so the
   cut-out does not eat the outline.
3. **The patterns are measured in a 64-cell reference space.** The source app's
   `period`, `bandHeight` and `ringWidth` are cell counts on a 64-cell grid. Measuring
   them against `REFERENCE_GRID` means a 64-cell portrait and a 128-cell portrait draw
   the same picture rather than the same picture at two zooms.
4. **The model weights are fetched when the studio opens.** The source app warmed its
   detector up as soon as the studio was reached; here the studio is reachable from a
   title sequence, and a visitor who never opens it should not pay for a face model.
5. **WebGPU is not asked for.** Carried over from the source app's measurement: the
   WebGPU matte put holes through foreheads and cheeks (mean face alpha 157/255
   against 232/255 on WASM). A correct cut-out beats a fast wrong one.

## 4. Practical impact, and what a future reader must know

- **Nothing throws.** `detectFace` and `segmentSubject` return `null` on every
  failure, and the studio keeps the photograph it already had. A blocked CDN costs the
  face detection and the background removal; it costs nothing else.
- **The models are optional upgrades.** The studio is fully usable with neither: the
  skin estimate frames the portrait, and the photograph is shown whole.
- **`vitest.config.ts` gained the `@` alias mirror.** `vite.config.ts` is untouched.
  The reason is architectural: the feature-first rule lets one feature reach another
  through its barrel, and a barrel path that cannot be resolved is a module that
  cannot be unit-tested. The alias was added to the test config, not to the app one.
- **`PortraitGrid` is the seam.** A photograph and a stored sprite both become the
  same grid of cells with the same flag saying which cells are ground, so the gold
  plate never learns where its portrait came from.
- **Wei_Ling's sprite is data, not code.** It is the avatar the source app recorded
  for her, carried across verbatim as an indexed sprite, and read through the same
  codec everything else uses.
- **Test ids** follow the house convention: `avatar-studio__{role}` inside the
  studio, `premiere-header__avatar-studio` and `premiere-header__wei-ling` in the
  header.

## 5. Validation actually performed

- `npx tsc --noEmit` passed.
- `npm test` passed: 21 test files, 189 tests, including 30 new avatar-studio tests
  across the sprite codec, the face crop, the matte arithmetic, the portrait grid and
  the gold plate.
- `npm run build` passed; the single-file `dist/index.html` is 1,061.59 kB (291.16 kB
  gzip).
- The Wei_Ling plate was rendered to PNG with Node's built-in `zlib` and inspected in
  this sandbox, for all four patterns. The sitter is recognisable and gilded, the
  enamel bands read, and the rim closes the plate. The render harness was a scratch
  file and is not committed.
- **No browser is available in this sandbox.** The MediaPipe and MODNET paths, the
  header buttons, the modal layout and the shimmer animation are unverified in a real
  browser; only the pure layer and the rendered pixels have been seen.
