# ADDENDUM-017 - Face-aware Gold Avatar Studio

**Date:** 2026-10-24; relates to BUILD_PROMPT sections 3 and 7; CLAUDE.md sections 1, 2, 5, 6, and 7
**Status:** Implemented - browser visual verification pending.

## 1. Decision

The previously opt-in Gilded Portrait feature is now mounted in the Gatsby host as
the Gold Avatar Studio. It ports the reference app's two separate photo jobs without
mixing their responsibilities:

- face detection locates the largest face and reports its box;
- portrait segmentation supplies the subject alpha used for background removal;
- gold rendering remains the existing deterministic CPU pipeline;
- a generated colour-and-gold art backdrop is composited behind the cutout.

The studio includes a `Show Wei_Ling` action using the original
`tmp/special-fiesta/images/ingest/social-01-female.png` reference photograph, copied
to `public/demo/wei-ling.png` so the application does not depend on the reference
checkout at runtime.

## 2. Reference Port

The implementation follows the reference app's proven progressive strategy. It
tries the browser Shape Detection API first and then loads MediaPipe BlazeFace full
range from a CDN. Background removal lazy-loads Transformers.js and the MODNET
portrait matte. Both model boundaries return `null` instead of failing the studio.
When portrait segmentation is unavailable, a deterministic border-colour mask gives
plain-background portraits a local fallback.

The two model runtimes remain lazy CDN imports rather than application dependencies.
This keeps the title sequence's initial bundle free of model runtimes and weights.
The photograph remains in browser memory; only public model code and weights are
fetched. No photo is uploaded.

## 3. Module Boundaries

- `faceDetection.ts` owns browser/MediaPipe adapters plus tested face-box selection
  and clamping.
- `subjectSegmentation.ts` owns the lazy MODNET adapter and matte decoding.
- `subjectMask.ts` owns the tested fallback matte, mask scaling, and alpha application.
- `artBackdrop.ts` owns tested sapphire, emerald, and ruby art fields with gold fan
  linework, plus alpha compositing.
- `useGildedPortrait.ts` owns the sequential detect-then-remove workflow and exposes
  plain state/actions to the UI.
- `AvatarIntelligenceControls.tsx` renders the face readout, background toggle, face
  overlay, and art backdrop controls.

All supported reusable APIs are exposed through the feature barrel. The host imports
only `GildedPortraitLauncher`; it does not reach into the feature internals.

## 4. Interface And Output

The launcher is named Avatar Studio. Each loaded portrait moves through explicit
`detecting-face` and `removing-background` states. Viewing the original reveals the
detected face frame. The background can be restored or removed, and removed portraits
can use one of three coloured Art Deco backdrops. Gold linework is part of the raster
output; the moving sheen remains preview-only. PNG export therefore matches the
chosen gold treatment and backdrop without requiring CSS.

Every new interactive element follows the `gilded-portrait__{role}` test-id contract.
The Wei_Ling action intentionally exercises the same file decoding, face detection,
segmentation, gilding, and export paths as a user upload.

## 5. Practical Impact

The first studio use can fetch MediaPipe, MODNET, and their WebAssembly runtimes, so
it needs network access for the highest-quality result. Existing title playback does
not pay that cost. Unsupported or offline browsers retain a usable gold conversion
and local plain-background cutout. No backend, persistence, camera permission, or new
npm dependency was introduced.

## 6. Validation

- `npx tsc --noEmit` passed.
- `npm test` passed: 21 files and 165 tests, including new face selection, subject
  masking, backdrop generation, compositing, and immutability coverage.
- `npm run build` passed. The single-file `dist/index.html` is 1,052.64 kB
  (287.51 kB gzip); the lazy model runtimes and weights are not bundled.
- No browser is available in this sandbox. Real-photo model loading, visual quality,
  responsive modal layout, and PNG download remain visually and cross-browser
  unverified.