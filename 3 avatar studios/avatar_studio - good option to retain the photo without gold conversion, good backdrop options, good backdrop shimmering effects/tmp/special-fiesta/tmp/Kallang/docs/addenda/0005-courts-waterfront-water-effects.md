# Addendum 0005 — Ball-court players, corrected waterfront paths, mapped water sprinkling

- **Date:** 2026-10-17 · **Relates to:** spec §5–§6 · **Requested by:** user review of PR #1
- **Ball courts (measured on qa/measure-courts.png):** the backdrop has two
  fenced hard courts right of the running track — a teal futsal court
  (surface x 1780–2220, y 1022–1100) and a teal/orange basketball court
  (x 2220–2640, y 1030–1102). Added team-coloured players at diorama height
  30–36px using a new ping-pong patrol behaviour (`patrolAt`/`createPatrol`
  in character.ts): three shuttling runners + two call-for-the-ball idlers
  per court, plus a bouncing/shuttling football (equipment-v2-11) and
  basketball (equipment-v2-10) via the new `objects/ball.ts`. All feet stay
  inside the measured surfaces, in front of the back fence, behind the
  promenade layers.
- **Waterfront runners fixed:** grid measurement (qa/measure-waterfront-*.png)
  showed the lower-right strip at y 1240–1280 is a *retaining-wall face*
  above a narrow wooden boardwalk (deck y ~1262–1300, x 1380–2620) — the old
  flat lanes ran people across that wall and off the boardwalk ends into
  the water. Promenade lanes now follow the measured walkable surfaces:
  behind the grass bank (left), the paved waterfront (centre), and the
  UPPER promenade in front of the courts (right), as exported polylines in
  scene.ts. Two patrol runners/walkers use the actual boardwalk deck and,
  being patrols, cannot run off its ends; their feet sit on the deck's
  front lip so they pass in front of the gangway ramps. Right-side
  cheerers/idlers moved from the wall face onto the upper promenade.
- **Water map + random sprinkling (scene/waterMap.ts):** the water boundary
  is now data — a measured shoreline polyline (grass bank → wall base →
  boardwalk front edge) plus exclusion rects for the boardwalk/pontoon and
  the blue floating dock. `placeWaterEffects` rejection-samples 22
  seeded-random points that are provably in open water and ≥135px apart;
  sprites mix ripples with small splashes (ripple-v1-05/06 excluded: they
  have an oar painted in). Effects can never land on shore/deck/dock
  (unit-tested), and a traffic fade — boat hull∪wake rects from the same
  pure centre-x helpers the boats draw with (scene/traffic.ts) — dissolves
  each effect to alpha 0 as a boat reaches it, so sprinkling never clashes
  with traffic. `npm run qa:scene -- --watermap` renders the proof overlay
  (shoreline, exclusions, paths, courts, placements, traffic rects).
- **Validation:** Vitest 19 passing (new suites for the water map,
  placement determinism/separation, patrol bounds, traffic fade/rects);
  QA stills at t=2/6.5/17 plus court & waterfront zooms inspected.
