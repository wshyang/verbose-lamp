# Addendum 0007 — Runner gait cycle and dragon-boat hand/paddle stitching

- **Date:** 2026-10-17 · **Relates to:** addenda 0003 (anchors), 0005/0006, spec §6
- **User report:** (1) some runners were a single sprite "floating" through
  space with no motion-phase variation; (2) on the long boats an oar appeared
  attached to the drum, the last two rowers had no oars, and paddle
  pivots/hands were wrong.

## Runners: diagnosis and fix
- Old gait alternated `run-right` with `side-right` — a run pose vs a
  *standing* pose. Head/torso identical across frames, bob peaked exactly at
  the frame swap: at scene scale it reads as one sprite gliding.
- The sheet actually carries more phases. Pixel-diffing proved
  `run-left` mirrored is a *distinct stride* (alpha-mask difference vs
  `run-right`: 983–1558 px for red/blue/green, 11028 px for yellow), and
  orange/purple carry four distinct phases (`run-right-a/b`,
  `run-side-right`, `run-side-left` mirrored; diffs 4–9k px).
- New gait (`src/objects/character.ts`): 4-phase cycle
  contact → passing → contact → passing for every kit, mirrored frames
  resolved by `flip = movingLeft XOR mirror`. Bob is phase-locked
  (`0.5 - 0.5·cos(4π(φ-0.125))`): zero at contact centres (feet plant),
  max at passing centres. Amplitude scales with speed (0.03/0.045/0.06 of
  height) and a ±2.1° forward rock keeps the torso alive. Evidence:
  `qa/gait-strip.png` (`npm run qa:gait`), all kits × both directions.

## Dragon boats: measured crew geometry
- Old anchors: 10 stations from x=0.233 stepping 0.05 to 0.683 — a guessed
  uniform spacing. Pixel measurement of the sprites (skin-cluster detection
  over the red boat; green/purple agree within ±0.003): the crew is a
  drummer + **9 rowers**, heads at x = 0.268…0.817, spacing ~0.069.
  Station 0 (0.233) sat inside the drum (x 0.195–0.255); drift left of
  rowers 8–9 meant they never got paddles. Exactly as reported.
- Hands measured: lower/extended fists at y≈0.648, x = 0.252, 0.322, 0.390,
  0.460, 0.528, 0.597, 0.666, 0.737, 0.806. Raised (top-hand) fists at
  y≈0.36, x = 0.294…0.781 — 8 detected; zoom inspection shows each belongs
  to the rower on its right (forearm slopes down-right behind that head),
  and rower 1's raised arm is not painted (predicted at 0.224 from the
  constant −0.028 offset to his lower fist).
- The two fists define a shaft angle of −30° from vertical; a swinging
  paddle cannot stay through both painted hands. Minimax stitch: each
  station is the **midpoint of the rower's two fists** and the paddle
  rotates about a pivot 22% down its length there. Hands lie exactly on the
  shaft at the −28° exit keyframe; worst-case hand-to-shaft error at catch
  is ~19 sprite px (≤12 px at the largest scene scale).
- New anchors: 9 stations (0.238…0.794, y≈0.50), length 0.68 boat heights
  (blade just dips), stroke +4° → −28° with recovery lift. Splash tip now
  accounts for the pivot being partway down the paddle.
- Evidence: `qa/measure-dragon*.png` (grid + old stations overlaid),
  `qa/lab-phase-strip*.png` (4 stroke phases), `qa/zoom-dragon-near.png`.
- Validation: Vitest 27 passing, incl. suites locking the 9-station span/
  spacing, no-drum-station, gait frame/bob invariants.
