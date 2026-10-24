import type { AvatarWaves } from '@psd/contracts';

/**
 * ADR-208 — ⚡ chevron & bargello waves.
 *
 * Straight bands, displaced sideways by a wave. One expression:
 *
 *     band = floor((v − amplitude·W(u / period)) / bandHeight) mod bands
 *
 * `W` is the only difference between the two looks. Chevron is a **triangle wave**, whose
 * corners are the zigzag; bargello — the Florentine flame stitch — is a **sine**, whose
 * rounded crests are the flame. Needlework bargello is defined by *stepping*: each upright
 * stitch offset from its neighbour by a fixed amount, with the colour following the resulting
 * profile. A per-column offset applied to a stack of bands is exactly that, which is why this
 * is one pattern with a waveform knob rather than two patterns that differ by one line.
 *
 * Amplitude arrives as a FRACTION of the period and is converted to cells here. The probe found
 * that legibility depends on the ratio, not on either number alone: the settings that turn to
 * mush fall on a line of constant amplitude-to-period, so a cell-valued control would be fine
 * at one period and ruined at another, having told the participant nothing.
 *
 * Amplitude zero is not a degenerate case to guard against — it is **plain horizontal
 * stripes**, a good-looking backdrop the probe recommended shipping by name, and it falls out
 * of the same expression with `W` multiplied by nothing.
 */
export function wavesBandOfCell(
  cell: { x: number; y: number },
  size: number,
  pattern: AvatarWaves,
): number {
  const centre = size / 2;
  const u = cell.x + 0.5 - centre;
  const v = cell.y + 0.5 - centre;

  const swing = (pattern.period * pattern.amplitude) / 10;
  const offset = swing * waveform(u / pattern.period, pattern.wave);

  /*
   * `v − offset` is negative over the top half of the avatar, and JavaScript's `%` keeps the
   * sign of the dividend, so the plain remainder would hand back negative band indices for
   * half of every pattern. The double-mod is the standard fix, and it is here rather than in
   * the caller because a band index is this function's output and should be in range when it
   * leaves.
   */
  const index = Math.floor((v - offset) / pattern.bandHeight);
  return ((index % pattern.bands) + pattern.bands) % pattern.bands;
}

/**
 * Both waveforms on [-1, 1] with period 1.
 *
 * The triangle uses the branch-free closed form `4·|t − ⌊t + ¾⌋ + ¼| − 1` rather than an
 * if-chain over the quarter-phases. Two reasons: it is called once per cell, 4,096 times per
 * render, and a branch per quarter is four more paths for the coverage gate to demand
 * exercising to prove something arithmetic already guarantees.
 */
function waveform(t: number, wave: number): number {
  if (wave === 2) return Math.sin(t * Math.PI * 2);
  return 4 * Math.abs(t - Math.floor(t + 0.75) + 0.25) - 1;
}
