# Addendum 0003 — Composite anchor tuning log (boats + paddles)

- **Date:** 2026-10-17 · **Relates to:** spec §4, CLAUDE §12.3
- **Method:** measure on 5%-grid overlays of the extracted sprites
  (`qa/measure-*.png`), render the composite lab with the real renderer in
  Node (`npm run qa:lab` → `qa/lab.png`, `qa/lab-phase-strip.png`), inspect,
  adjust `src/generated/anchors.json` only.
- **Round 1 (initial measurement):** dragon stations at head-x − 0.012,
  y=0.445, paddle length 0.68 boat-heights, catch +27°. Findings: grips
  floated above the crew's forward-reaching hands; blades hung too deep;
  wake (wake-v2-02 at alpha .75) read as a solid cloud; kayak black double
  paddles at 0.40 boat-widths and chest pivot y=0.46 crossed paddlers' faces
  and visually swamped K3.
- **Round 2:** stations → x −0.014 further toward the bow, y=0.495 (into the
  painted hand cluster); paddle length 0.63; catch +24°, exit −18°; wakes
  switched to the thinner v1 streaks, squashed ×0.5 vertically, alpha .55.
  Kayak: wooden paddle (paddle-double-01), length 0.335 widths (the sheet's
  own relative scale), seat pivots lowered to lap height (y≈0.47–0.52) and
  re-measured per kind (K1 0.51, K2 0.415/0.64, K3 0.35/0.555/0.755) from the
  grid overlays; swing ±32°. Result: grips sit in hands through the cycle,
  mirrored (rightward) composites stitch identically.
- **Round 3 (micro):** kayak length 0.36, swing ±34° so the low blade clearly
  breaks the waterline with its splash. Dragon recovery lift left at 0.13 —
  blades skim rather than fully clear, which matches the painted foam at the
  hull base.
- **Known art limits:** crew poses are baked at a forward reach, so grips are
  anchored to the hand cluster rather than a raised top hand; K3 paddles
  necessarily overlap in side view. Both are properties of the source art.
