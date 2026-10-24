# ADDENDUM-008 — Correct poster-edge target and harmonize Frame Studio

**Date:** 2026-10-23  
**Relates to:** ADDENDUM-006/007 (poster frame), ADDENDUM-004/005 (genesis), BUILD_PROMPT §3, §4, §6, §7  
**Decision Context:** DC-006  
**Status:** Plan accepted; implementation recorded in ADDENDUM-009.

---

## 1. Correction: poster border is a different surface

The supplied one-sheet image shows a gold frame **at the outer perimeter of the poster**, surrounding its entire composition. ADDENDUM-006/007 implemented its geometry inside `buildFrameSpecs`/`createGatsbyCardRig`, where the frame is drawn around the title-card typography. That target was wrong.

The correction is a separate, camera-attached WebGL border layer, sized to the viewport frustum and inset from all four screen edges. It may coexist with the title-sequence card frame. It must not replace, resize, or change the title/card frame, camera path, or text.

The poster is still an authored one-sheet illustration. Its edge frame has a regular geometric grammar (nested 45°-mitered rectangles, four-corner fan motifs, mid-edge clasps) that can be procedurally generated. The generator borrows that grammar; it does not reproduce the poster image, photography, logo, or type.

## 2. Unified mental model and controls

There is one Frame Studio with two **surfaces**, not two competing frame types:

| Surface | What it changes | Pattern choices |
|---|---|---|
| **Title Cards** | Frames surrounding the animated title-card copy | Authored, Fractal, Rosette, Arcade |
| **Poster Edges** | Optional border at all four viewport edges, outside the title-card composition | One-Sheet Deco |

Each surface keeps its own style state. The same `Level` and `Detail` controls edit the selected surface, so tuning is consistent and changing surfaces never overwrites the other surface's selection. The Poster Edges surface includes a clear visibility toggle; it starts off. Selecting that surface exposes its controls but does not implicitly enable the border. `One-Sheet Deco` is one pattern with density variants, not a second unrelated family of “frame types.”

### Shared control semantics

- `Pattern`: title-card source on Title Cards; `One-Sheet Deco` on Poster Edges.
- `Level` 1–4: controls recursion/density for a generative pattern. Disabled only for the fixed Authored title-card pattern.
- `Detail` 0–100: the existing intricacy grammar, with the same five presets and meanings on both surfaces. Display the 50 preset as **Balanced** in the shared UI; the underlying title-frame baseline remains 0.5 and snapshot-protected.
- `Apply to`: explicit surface tabs `Title Cards` / `Poster Edges`.
- Poster border visibility is independent from editing-surface selection.

## 3. State contract

- Default selected surface: Title Cards.
- Default title style: `{ source: authored, level: 2, detail: 0.5 }` (no visual change).
- Default poster style: `{ level: 2, detail: 0.5 }`.
- Poster border visible: false on fresh load.
- Switching surfaces changes only which settings are edited.
- Selecting a poster pattern does not alter the title-card formula; applying a title pattern does not alter the poster border.
- Toggling poster visibility only adds/removes the edge-border rig; it does not pause playback or change title animation.
- Settings are client-memory only; no persistence.

## 4. Implementation plan

1. Remove `poster` from `FrameSource`; keep the title-card source union to Authored/Fractal/Rosette/Arcade. Preserve the authored golden snapshot.
2. Extract the poster grammar to a pure `posterBorder.ts` generator that receives viewport-derived half-width/half-height and returns full, closed, D4-symmetric edge-frame rails (not title-card specs).
3. Add a camera-attached `PosterBorderRig` in Three.js. Derive its plane dimensions from FOV, aspect, and fixed camera-local distance; rebuild on resize/style changes; render with the existing bevelled-gold trim material at a high render order, disabled depth testing, no gate parting, and no camera-parallax offset.
4. Store poster level/detail/visibility independently in `GatsbySceneManager`. Preserve the existing title `FrameStyle` API and default.
5. Replace separate `Frame Genesis` and `Frame Intricacy` panels/hooks with one `FrameStudioControl` and `useFrameStudio` hook: surface tabs → pattern → shared level/detail → poster visibility.
6. Add pure tests for poster edge extents, D4 symmetry, closed outer frame, level/detail monotonicity, bounds, and deterministic output. Ensure no poster source leaks into title-card golden tests.
7. Record implementation, deviations, measurements, validation, and the sandbox browser limitation in ADDENDUM-009.

## 5. Risks and safeguards

- **Overlap with HUD:** inset the border sufficiently from the viewport edge and keep it behind all DOM controls; do not position it over the title lockup.
- **Camera child omission:** explicitly add the camera to the scene before its child border group is rendered; test this structurally and inspect in a browser when available.
- **Perspective aspect changes:** rebuild border coordinates after resize from the actual FOV/frustum. Do not hard-code pixel dimensions or reuse title-card box extents.
- **Visual source confusion:** call the surface `Poster Edges`, the pattern `One-Sheet Deco`, and never label the title-card pattern as a poster frame.
- **Baseline regression:** title-card `authored` geometry snapshot stays unchanged; poster border defaults hidden.

## 6. Validation plan

Run `npx tsc --noEmit`, `npm test`, and `npm run build`. Browser verification of the border at desktop, portrait, and ultrawide sizes remains pending if no browser is available.