# Addendum 0008 — Algorithmic repair of rower 1's missing raised arm

- **Date:** 2026-10-17 · **Relates to:** addendum 0007 (measured hands)
- **User request:** the first rower's far-side (raised/top-hand) arm is not
  rendered in the art; copy an arm from another character algorithmically.
- **Tool:** `tools/repair_dragon_rower_arm.py`, run automatically at the end
  of `tools/extract_sprites.py` and standalone. Per hull colour:
  1. Rower head centres detected from dark-head (hair+outline) column
     clusters (fragment-merged; 9 rowers at x≈0.268…0.817 on all 6 boats).
  2. Donor = rower 2 **of the same sprite** (palette always matches).
     His raised arm is flood-filled from the fist seed within a buffered
     corridor along the forearm (caps stop at the face/hair); colour
     classes separate skin / near-black outline / wristband purple from
     blue-grey hair, magenta keying fringe is pruned, one outline dilation
     keeps the dark edge. Component 659–905 px depending on hull colour.
  3. Pasted at the head-centre delta (dx −74…−78 px) **only onto
     transparent pixels**, so the cloned forearm disappears behind
     rower 1's hair and the drum exactly like the painted originals.
  4. Idempotent: skin present at rower 1's fist position → untouched.
- **Verification:** changed pixels vs pre-repair sprites are confined to
  x 0.217–0.258, y 0.30–0.474 (369–574 px/boat, pasted subset); all boats
  now detect 9 raised fists, rower 1's at (0.229–0.231, 0.361–0.364).
  Anchor station 0 updated from the *predicted* fist to the measured one:
  midpoint of (0.230, 0.363) and lower fist (0.252, 0.648) = (0.241, 0.506).
  Evidence: `qa/arm-before-after.png`, `qa/lab-phase-strip.png` (grip in
  the new fist at exit phase).
- **Note:** the short mid-height forward arm other rowers show would land
  behind the drum for rower 1 — plausibly why the art omits it; left as is.
- **Tests:** `tests/python/test_repair_dragon_arm.py` (head detection,
  shipped-sprite arm present, erase→repair→idempotent round-trip);
  full suites: pytest 14, Vitest 27 passing.
