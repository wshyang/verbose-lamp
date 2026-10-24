import type { BackdropPattern } from '../types';

/**
 * ADDENDUM-017 — the backdrop's artwork, ported from the beach app's avatar studio.
 *
 * Four generators, each self-contained, each asking the same question a different way:
 * which band of the pattern is this cell standing in? They share no code beyond the unit
 * space they are measured in, so tuning one cannot move another.
 *
 * The house change is not in the geometry but in what is painted with it: these bands
 * used to hold flat psychedelic colours, and here they hold enamel over a gold plate.
 */

/**
 * The grid the source app measured its patterns on.
 *
 * Every generator works in these units, so a portrait on a 64-cell grid and the same
 * portrait on a 128-cell grid draw the same picture rather than the same picture at two
 * different zooms.
 */
export const REFERENCE_GRID = 64;

/** How far a ray is dragged round per cell of radius. */
export const TWIST_STEP = 0.006;

/** `w·f² ≤ 0.8` — the measured line between bands that separate and bands that merge. */
export const WARP_CEILING = 0.8;

/**
 * The sunburst, as a recolouring of backdrop cells: the angle is dragged sideways in
 * proportion to distance, which is what makes it spiral; rays and gaps alternate at
 * equal width.
 */
export function raysBandOfCell(
  cell: { readonly x: number; readonly y: number },
  size: number,
  pattern: BackdropPattern
): number {
  const unit = size / REFERENCE_GRID;
  const centre = size / 2 / unit;
  const dx = (cell.x + 0.5) / unit - centre;
  const dy = (cell.y + 0.5) / unit - centre;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) + radius * pattern.twist * TWIST_STEP;
  const sector = (angle / (Math.PI * 2)) * pattern.rays;
  const phase = ((sector % 1) + 1) % 1;
  return Math.min(pattern.bands - 1, Math.floor(phase * pattern.bands));
}

/**
 * The chevron: straight bands displaced sideways by a triangle wave, which is the
 * Florentine flame stitch stepped rather than drawn.
 *
 * Amplitude arrives as a fraction of the period, because legibility depends on the
 * ratio and not on either number alone.
 */
export function chevronBandOfCell(
  cell: { readonly x: number; readonly y: number },
  size: number,
  pattern: BackdropPattern
): number {
  const unit = size / REFERENCE_GRID;
  const centre = size / 2 / unit;
  const u = (cell.x + 0.5) / unit - centre;
  const v = (cell.y + 0.5) / unit - centre;
  const swing = (pattern.period * pattern.amplitude) / 10;
  const offset = swing * triangleWave(u / pattern.period);
  // `v − offset` is negative over the top half, and JavaScript's `%` keeps the sign of
  // the dividend, so the double-mod is the standard fix.
  const index = Math.floor((v - offset) / pattern.bandHeight);
  return ((index % pattern.bands) + pattern.bands) % pattern.bands;
}

/** The triangle wave on [-1, 1] with period 1, branch-free. */
function triangleWave(t: number): number {
  return 4 * Math.abs(t - Math.floor(t + 0.75) + 0.25) - 1;
}

/** p=∞ is the square, and is `max` rather than `pow` because `pow` cannot express it. */
function shapeDistance(dx: number, dy: number, exponent: number): number {
  if (!Number.isFinite(exponent)) return Math.max(Math.abs(dx), Math.abs(dy));
  if (exponent === 2) return Math.sqrt(dx * dx + dy * dy);
  return (Math.abs(dx) ** exponent + Math.abs(dy) ** exponent) ** (1 / exponent);
}

/**
 * The rings: bands of constant SHAPE distance rather than constant radius, which is the
 * whole difference between this and a target. A rose term modulates that distance with
 * the angle, which is what turns plain rings into petals.
 */
export function ringsBandOfCell(
  cell: { readonly x: number; readonly y: number },
  size: number,
  pattern: BackdropPattern
): number {
  const unit = size / REFERENCE_GRID;
  const centre = size / 2 / unit;
  const dx = (cell.x + 0.5) / unit - centre;
  const dy = (cell.y + 0.5) / unit - centre;
  const base = shapeDistance(dx, dy, pattern.exponent);
  const petals = 1 + (pattern.depth / 10) * Math.cos(pattern.lobes * Math.atan2(dy, dx));
  // `max(0, …)` rather than a clamp: at the deepest setting the rose term bottoms out
  // near zero but never below it, and a negative distance would wrap the innermost ring
  // to the outermost colour — one wrong pixel in the middle of a face.
  const distance = Math.max(0, base * petals);
  return Math.floor(distance / pattern.ringWidth) % pattern.bands;
}

/**
 * The kaleidoscope: the other three evaluate a formula at the point they are given, and
 * this one moves the point first. That is domain warping, and it is the whole technique
 * behind the liquid, melting look: displace the sample, then evaluate something
 * perfectly regular there.
 */
export function kaleidoscopeBandOfCell(
  cell: { readonly x: number; readonly y: number },
  size: number,
  pattern: BackdropPattern
): number {
  // Unit space, so the warp strengths mean the same thing on a 64-cell grid and a
  // 128-cell one. A warp measured in cells would be half as strong on the larger grid.
  const u = (cell.x + 0.5) / size - 0.5;
  const v = (cell.y + 0.5) / size - 0.5;
  const frequency = Math.max(0.2, pattern.frequency);
  const strength = (pattern.ripple / 10) * (WARP_CEILING / (frequency * frequency));
  const sweep = Math.PI * 2 * frequency;
  const warpedU = u + strength * Math.sin(sweep * v);
  const warpedV = v + strength * Math.sin(sweep * u);
  const radius = Math.hypot(warpedU, warpedV);
  const angle = Math.atan2(warpedV, warpedU);
  const arms = pattern.swirl * pattern.bands;
  const distance = (radius * REFERENCE_GRID) / pattern.scale + (arms * angle) / (Math.PI * 2);
  const index = Math.floor(distance);
  return ((index % pattern.bands) + pattern.bands) % pattern.bands;
}

/**
 * Which band of the backdrop artwork a cell falls in.
 *
 * The one switch over the four patterns. It is a switch over a discriminated union, so
 * adding a pattern without wiring it here will not compile — which is how two patterns
 * end up sharing a bug otherwise.
 */
export function bandIndexOf(
  cell: { readonly x: number; readonly y: number },
  size: number,
  pattern: BackdropPattern
): number {
  if (pattern.kind === 'chevron') return chevronBandOfCell(cell, size, pattern);
  if (pattern.kind === 'rings') return ringsBandOfCell(cell, size, pattern);
  if (pattern.kind === 'kaleidoscope') return kaleidoscopeBandOfCell(cell, size, pattern);
  return raysBandOfCell(cell, size, pattern);
}

/**
 * The house patterns, with the source app's measured defaults.
 *
 * Two bands for the rays on purpose: it is the look the source app's participants
 * already wore, and changing what a stored picture draws is not a default change, it is
 * an edit to somebody's face.
 */
export const DEFAULT_PATTERNS: Readonly<Record<BackdropPattern['kind'], BackdropPattern>> =
  Object.freeze({
    rays: Object.freeze({
      kind: 'rays',
      bands: 2,
      rays: 12,
      twist: 4,
      amplitude: 4,
      period: 24,
      bandHeight: 8,
      lobes: 6,
      depth: 2,
      exponent: 2,
      ringWidth: 8,
      frequency: 2,
      ripple: 6,
      swirl: 1,
      scale: 8,
    }),
    chevron: Object.freeze({
      kind: 'chevron',
      bands: 3,
      rays: 12,
      twist: 4,
      amplitude: 4,
      period: 24,
      bandHeight: 8,
      lobes: 6,
      depth: 2,
      exponent: 2,
      ringWidth: 8,
      frequency: 2,
      ripple: 6,
      swirl: 1,
      scale: 8,
    }),
    rings: Object.freeze({
      kind: 'rings',
      bands: 3,
      rays: 12,
      twist: 4,
      amplitude: 4,
      period: 24,
      bandHeight: 8,
      lobes: 6,
      depth: 2,
      exponent: 2,
      ringWidth: 8,
      frequency: 2,
      ripple: 6,
      swirl: 1,
      scale: 8,
    }),
    kaleidoscope: Object.freeze({
      kind: 'kaleidoscope',
      bands: 3,
      rays: 12,
      twist: 4,
      amplitude: 4,
      period: 24,
      bandHeight: 8,
      lobes: 6,
      depth: 2,
      exponent: 2,
      ringWidth: 8,
      frequency: 2,
      ripple: 6,
      swirl: 1,
      scale: 8,
    }),
  });
