# Addendum 0006 — Why the first fix round wasn't visible, and the correction

- **Date:** 2026-10-17 · **Relates to:** addendum 0005, spec §5–§6
- **User report:** after 0005, only the waterfront-path fix was perceptible;
  courts/water effects looked unchanged. Diagnosis was measured, not guessed:
- **Water effects:** the traffic fade was eating the sprinkling. With the
  real placements and boat configs, average fade over all 22 effects was
  0.37–0.64 depending on t, with 7–12 of 22 fully hidden and only 6–13
  clearly visible *before* each effect's own pulse dimming — about the same
  visible count as the original 6 fixed ripples. Root cause: each boat's
  fade rect is hull∪wake (≈975×130px for a dragon boat), so eight boats
  blanketed most of the bay. Fix: painter's-algorithm occlusion instead of
  fading — each flat effect is layered just behind the boat lane in front
  of it (`layerForWaterEffect`), so hulls hide what's behind them and
  effects below a waterline never draw over a hull. Count 22 → 34,
  sizes up (ripples 95–175px, splashes 55–92px, splash share 40%),
  brightness 0.85 → 0.95. `trafficFadeAt` removed; occupancy rects remain
  for the QA watermap overlay.
- **Ball courts:** players existed but at 30–36px in a 2752px world they
  read as specks. Squads enlarged to 7 per court (+ ball), heights raised
  to 33–44px graded by court depth (still inside the measured surfaces),
  balls 12 → 15px. Verified in qa/zoom-courts.png and the full still.
- **Unchanged:** waterfront paths/boardwalk patrols (user-confirmed good).
- **Validation:** Vitest 20 passing (layer-band and 34-placement suites),
  stills at t=2/6.5 + court/water zooms inspected.
