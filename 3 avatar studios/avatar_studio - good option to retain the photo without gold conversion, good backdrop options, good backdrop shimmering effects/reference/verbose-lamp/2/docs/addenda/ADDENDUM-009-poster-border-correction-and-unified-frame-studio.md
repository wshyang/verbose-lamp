# ADDENDUM-009 — Correct poster border target and unify Frame Studio

**Date:** 2026-10-23  
**Relates to:** ADDENDUM-008 (plan); supersedes the poster-surface placement in ADDENDUM-006/007; BUILD_PROMPT §3, §4, §6, §7, §11  
**Decision Context:** DC-006

## 1. What was corrected

The previous “Poster” genesis was incorrectly applied to the title-card frame. It is
removed from `FrameSource` and `buildGenerativeFrameSpecs`. The one-sheet border is now
a separate full-perimeter WebGL layer attached to the active camera at a fixed local
distance. Its dimensions derive from camera FOV and aspect ratio, and it rebuilds on
resize. The image remains an independent overlay around the viewport; title text and
sequence-card geometry are not changed.

The old “Frame Genesis” and “Frame Intricacy” panels/hooks have been replaced by one
`FrameStudioControl` and `useFrameStudio` model:

| Surface selected | Pattern choices | Tuning controls |
|---|---|---|
| Title Cards | Authored, Fractal, Rosette, Arcade | Level 1–4; Detail 0–100 |
| Poster Edges | One-Sheet Deco | Same Level and Detail controls; visibility toggle |

Level and Detail are the same UI controls with the same meanings. Each surface stores
its own settings, so switching surfaces never overwrites the other. “Poster edge on”
appears in the header when the user returns to title-card editing while the border is
still visible.

## 2. Defaults and interaction

- First load remains identical: Title Cards / Authored / level 2 / detail 0.5; Poster
  Edges are hidden.
- Selecting **Poster Edges** immediately enables the edge frame so the target change
  has visible feedback. This is a deliberate deviation from ADDENDUM-008’s strictly
  edit-only surface tab. The explicit `Show border` / `Border visible` button can hide
  it again without losing its style.
- Switching back to Title Cards leaves the poster border visible if it is enabled;
  this permits the outer edge frame and inner animated title-card frame to coexist.
- Poster level/detail changes call `setPosterBorderStyle`; title changes call
  `setSequenceFrameStyle`. Neither setter touches the other surface.
- `G` cycles sequence patterns only while Title Cards is the active editing surface;
  `[` and `]` adjust Detail on whichever surface is active.
- `One-Sheet Deco` is presented as the perimeter pattern, not another genesis source.
  Its density variants are the shared Level and Detail controls.

## 3. Construction

`src/webgl/frameGrammar/posterBorder.ts` builds a closed, full-width primary mitered
rectangle plus nested rails, four symmetric corner fans, quarter arcs, stepped corner
bands, mid-edge clasps, and top/bottom margin rules. All dimensions are in the camera
plane. The primary rail remains rank 0, so Minimal still shows a closed border; higher
Detail levels derive extra rails using the existing grammar.

`PosterBorderRig` attaches a shared six-facet chamfer geometry and gold trim material
to the camera at 2.4 world units. It disables depth testing, renders after the scene,
never gate-parts, and recomputes half-width/half-height from the actual frustum on
resize. `createGoldFrameMaterial` centralizes the existing trim-path, parting, gold-tip,
sheen, and opacity shader used by both title cards and the border; the title-card
baseline geometry snapshot remains unchanged.

The poster border’s elaboration offsets are normalized to the smaller frustum
dimension before applying the shared intricacy grammar. This prevents the maximum
Baroque echo ring from extending beyond the screen on portrait/narrow viewports.

## 4. Files and policy

- New: `src/webgl/PosterBorderRig.ts`, `src/webgl/frameMaterial.ts`,
  `src/webgl/frameGrammar/posterBorder.ts`, its pure test, `src/lib/hooks/useFrameStudio.ts`,
  and `src/components/FrameStudioControl.tsx`.
- Removed: the separate `GenesisControl`, `IntricacyControl`, `useFrameGenesis`, and
  `useFrameIntricacy` files; there is now one panel and one settings hook.
- `CLAUDE.md` test-ID example updated to `frame-studio__detail`.
- `GatsbySceneManager.ts` is 755 LOC (under the 800 LOC hard limit).

## 5. Verification

- TypeScript: `npx tsc --noEmit` passed.
- Unit tests: `npm test` passed, 4 files / 101 tests. Includes unchanged authored
  geometry snapshots, no poster entry in title-card sources, full closed edge frame,
  reflection symmetry, monotonically increasing Level/Detail density, deterministic
  output, and Baroque bounds at landscape, portrait, and ultrawide frusta.
- Production: `npm run build` passed; `dist/index.html` 897.92 kB (240.97 kB gzip).
- Visual browser verification is still pending because this sandbox has no browser.
  Specifically unverified: actual Three.js shader compilation, edge visibility against
  the rendered HDR scene, portrait/ultrawide composition, and possible visual overlap
  with the title-card frame. No claim of visual correctness is made.