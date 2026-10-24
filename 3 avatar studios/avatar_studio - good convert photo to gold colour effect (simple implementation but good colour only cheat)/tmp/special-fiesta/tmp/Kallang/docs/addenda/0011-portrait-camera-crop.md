# Addendum 0011 — Portrait/mobile camera crop on the stadium opening

- **Date:** 2026-10-17 · **Relates to:** spec §5, addendum 0009
- **Assessment (before):** the stage letterboxed the full 2752×1536 world
  to the column width. On a 390×844 phone the scene rendered ~358×200 CSS
  px (scale 0.13): 62px characters became ~8px, boats ~90px wide, signage
  unreadable — technically correct, practically a thumbnail.
- **Focus measurement:** the stadium opening (dark interior mouth) spans
  x 566–933 on the scene plates (dark-maroon column analysis, verified
  in qa/measure-opening.png); focus `STADIUM_OPENING_X = 750`. Vertically
  the opening already sits mid-frame (y 660–860), so the crop is
  horizontal only; full world height is always shown.
- **Implementation:** `computeSceneView(displayAspect)` (pure, tested)
  returns the full view for aspects ≥ world aspect (1.792), otherwise a
  window of width `1536 × aspect` centred on x=750, clamped to the world.
  `renderScene` takes an optional `SceneView` and applies it as a camera
  translate (canvas backing becomes view.width × 1536, so rendering
  stays 1:1 pixel-art). In the browser, landscape keeps the full world;
  portrait or ≤760px-wide viewports use aspect
  `clamp(vw/(vh×0.82), 0.6, world)` — a 390×844 phone gets a 922px-wide
  window at ~3× the letterbox scale (characters ~24 CSS px), the stage
  filling ~71% of viewport height. Recomputed on resize/orientation
  change; the composite lab keeps its fixed canvas.
- **Validation:** Vitest 35 (full-view/crop/clamp invariants, focus
  stays in frame at aspects 0.5–1.6); QA stills `--aspect=0.6/0.92`
  and dusk+portrait (themed sprites compose with the crop) inspected —
  opening dead-centre, sign/tents/boats readable. Playwright portrait
  test authored (390×844 asserts cropped canvas width).
