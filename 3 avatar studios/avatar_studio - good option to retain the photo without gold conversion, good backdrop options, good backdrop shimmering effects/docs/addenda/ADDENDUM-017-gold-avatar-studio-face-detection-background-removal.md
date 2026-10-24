# ADDENDUM-017 - Gold Avatar Studio: face detection, background removal, gold-cloisonné backdrops

**Date:** 2026-10-24; relates to BUILD_PROMPT sections 3 and 7; CLAUDE.md sections 1, 2, 5, 6
**Status:** Implemented - browser visual verification pending.

## 1. Decisions
- Ported from `tmp/special-fiesta/apps/web/src/lib/avatar/` into a new feature
  `src/features/avatar-studio/` (feature-first, barrel export):
  - Face detection (`locateFace.ts`, ADR-054): MediaPipe BlazeFace full-range loaded from CDN
    (`@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`). The pure crop math (eye-line, inter-ocular
    scale, box floor) lives in `model/cropBox.ts` and is unit-tested.
  - Background removal (`segmentPhoto.ts`/`cutOut.ts`, ADR-033/072/221): Transformers.js 4.3.0 MODNET on
    WASM from CDN. The pure part (plane reading, threshold, keep-the-face's-connected-piece, edge
    grow/shrink, feather) lives in `model/matte.ts`.
  - Avatar studio backdrops (sunburst/concentric/waves) are reinterpreted as **gold cloisonné**:
    jewel enamel over guilloché gold alternating with hammered gold leaf, separated by bevelled gold
    wires, in a stepped Deco bezel. Added Deco Fan and Chevron. Five enamel palettes.
  - Shimmer: 10 precomputed light phases played ping-pong (still under reduced motion).
  - Subject finish: "Gilded" reuses `gildImage` from gilded-portrait; "Natural" keeps photo colours.
    A soft gold rim is inlaid around the cut-out.
- Wei_Ling: her stored 128-cell indexed sprite is copied verbatim from
  `scripts/demo-participants.dump.json` into `data/weiLing.ts`; the matte comes from the sprite's
  palette convention (last two entries = backdrop, ink). Header button `WeiLingAvatarButton` opens
  the studio with her preloaded; the studio also has a Wei_Ling button.
- Both engines never throw: no face → centred crop; no model → whole photo kept, with a status note.
- `vitest.config.ts` gained the `@` alias so feature barrels resolve under test.
- Header now mounts `AvatarStudioLauncher` and `WeiLingAvatarButton`.

## 2. Validation
- `npx tsc --noEmit` passed; `npm test` 176 tests (17 new); `npm run build` passed.
- Wei_Ling composites rendered to PNG in Node and inspected visually (fan/ruby looked correct).
- No browser in sandbox: CDN model loading, face detection on real photos, and modal layout are
  **not** verified.
