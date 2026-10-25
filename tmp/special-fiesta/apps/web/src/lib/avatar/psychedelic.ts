import type { AvatarPsychedelic } from '@psd/contracts';

/**
 * ADR-209 — 🌀 psychedelic swirls & groovy waves.
 *
 * The other three patterns evaluate a formula at the point they are given. This one moves the
 * point first. That is **domain warping**, and it is the whole technique behind the liquid,
 * melting, Y2K-poster look: displace the sample by a couple of sine terms, then evaluate
 * something perfectly regular there. The regularity is what keeps it from becoming noise; the
 * displacement is what keeps it from looking drawn with a compass.
 *
 *     u' = u + w·sin(2πf·v)        v' = v + w·sin(2πf·u)
 *     D  = r'/scale + arms·θ'/2π   band = floor(D) mod bands
 *
 * Each axis is displaced by a wave read off the OTHER one. Along any row the x-displacement is
 * therefore constant while the y-displacement varies, so a band is BENT ALONG ITS LENGTH rather
 * than slid sideways; a warp taking both displacements from the same variable would shift each
 * row rigidly and never bend anything.
 *
 * One consequence, found by a test that asserted the opposite and was wrong to: the pair is
 * symmetric under swapping u and v, and so is the radius, so **the whole pattern has a mirror
 * line along y = x**. It is visible if you look for it, harmless behind a face, and asserted in
 * the tests so that it stays a known property rather than becoming a later surprise.
 *
 * **Why `arms` is a multiple of the band count.** `θ` jumps by 2π across the negative x-axis,
 * so `D` jumps by `arms` there, and `floor(D) mod bands` would show a hard radial seam unless
 * that jump is a whole number of colour cycles. Making the arm count `swirl × bands` closes
 * the cycle exactly, so there is no seam at any setting. The spiral gets this free by making
 * `rays` an integer and taking the phase *within* a sector; this is the same observation
 * applied to a pattern whose angular term and radial term share one running total.
 *
 * **Why the ripple is a fraction and not a distance.** The probe measured that a warp stops
 * separating bands when strength beats the SQUARE of frequency — `w·f² ≤ 0.8` is the line
 * between legible and mud. So the control is tenths of the frequency-dependent maximum, and
 * turning frequency up re-scales the strength underneath rather than silently dissolving the
 * avatar. This is the same decision ADR-208 made for wave amplitude, reached from a separate
 * measurement: two patterns, two couplings, one rule — **never expose the member of a coupled
 * pair that is only meaningful relative to the other.**
 */
export function psychedelicBandOfCell(
  cell: { x: number; y: number },
  size: number,
  pattern: AvatarPsychedelic,
): number {
  // Unit space, so the warp strengths below mean the same thing on the 64-cell drawn grid and
  // the 128-cell photo sprite. A warp measured in cells would be half as strong on the sprite.
  const u = (cell.x + 0.5) / size - 0.5;
  const v = (cell.y + 0.5) / size - 0.5;

  const frequency = pattern.frequency;
  const strength = (pattern.ripple / 10) * (WARP_CEILING / (frequency * frequency));
  const sweep = Math.PI * 2 * frequency;
  const warpedU = u + strength * Math.sin(sweep * v);
  const warpedV = v + strength * Math.sin(sweep * u);

  const radius = Math.hypot(warpedU, warpedV);
  const angle = Math.atan2(warpedV, warpedU);

  const arms = pattern.swirl * pattern.bands;
  const distance = (radius * size) / pattern.scale + (arms * angle) / (Math.PI * 2);

  const index = Math.floor(distance);
  return ((index % pattern.bands) + pattern.bands) % pattern.bands;
}

/** `w·f² ≤ 0.8` — the measured line between bands that separate and bands that merge. */
const WARP_CEILING = 0.8;
