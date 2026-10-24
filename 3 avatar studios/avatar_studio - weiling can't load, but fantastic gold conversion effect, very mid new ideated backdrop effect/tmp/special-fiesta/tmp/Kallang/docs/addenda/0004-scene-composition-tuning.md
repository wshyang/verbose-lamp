# Addendum 0004 — Scene composition tuning log

- **Date:** 2026-10-17 · **Relates to:** spec §5–§6
- **Method:** full-scene stills from the real renderer via Node
  (`npm run qa:scene` → `qa/scene-t2.png`, `qa/scene-t6_5.png`), inspected
  against the populated-reference backdrop; only `src/scene/scene.ts`
  layout constants change per round.
- **Round 1 findings:** extracted cartoon clouds at 500–640px wide swamped
  the sky; the PSD banner covered "THE" of the painted Kallang sign; the far
  boat lane (waterline 1332) sailed over the right-hand pontoon; walkers on
  flat lanes stood in the water at the left edge, where the painted shoreline
  rises diagonally.
- **Round 2:** clouds shrunk (190–420px, alpha .85, higher band); banner
  moved left of the sign and shrunk; boat lanes pushed below the pontoon
  (far 1388 / mid ~1435 / near ~1480+); walkers/joggers given sloped
  promenade paths (`pathYAt` interpolation in character.ts) following the
  painted shoreline.
- **Round 3 findings/fixes:** the front promenade path still dipped under
  the water's edge at far left (shore slope is steeper than first measured) —
  paths re-anchored to (-60,1204)→(300,1236)→(800,1262)→(2820,1274); a
  rightward kayak and the near dragon boat momentarily overlapped hulls —
  near lanes separated (1470 / 1494 / 1514) so crossings read as passing in
  adjacent lanes.
- **Stylistic licence (recorded):** people and boats are drawn larger than
  the backdrop's literal scale (where a person is ~14px) so the extracted
  sprite detail stays readable — a diorama reading, consistent with the
  populated reference's intent rather than its exact proportions.
