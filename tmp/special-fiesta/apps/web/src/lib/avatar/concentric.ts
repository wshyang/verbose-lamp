import { CONCENTRIC_SHAPES, type AvatarConcentric } from '@psd/contracts';
import { required } from '../required.js';

/**
 * ADR-207 — 🌀 concentric radiating shapes, the seventies eco-logo.
 *
 * Bands of constant SHAPE distance rather than constant radius, which is the whole difference
 * between this and a target. Two terms, both standard:
 *
 *   - the **Minkowski p-norm** `(|u|^p + |v|^p)^(1/p)` decides what \"distance\" means, and its
 *     unit ball is a diamond at p=1, a circle at p=2, a squircle at p=4 and a square as p→∞.
 *     Four stops, not a slider: the values between them do not read differently at 32px, so a
 *     continuous exponent would be offering precision the picture cannot show.
 *   - a **rose term** `1 + depth·cos(lobes·θ)` modulates that distance with the angle, which is
 *     what turns plain rings into petals. `lobes = 0` is a plain target and is a perfectly good
 *     setting, not a degenerate one.
 *
 * Deliberately self-contained. It shares no code with the spiral beyond the unit-space helper
 * and the band index it returns, so tuning one cannot move the other — which is the whole
 * reason four named patterns were chosen over two generators with a mode flag.
 *
 * The half-cell offset is the same one `bandOfCell` uses and is there for the same reason:
 * sampling the middle of the pixel keeps the pattern symmetric about the centre rather than
 * leaning half a cell up and to the left.
 */
export function concentricBandOfCell(
  cell: { x: number; y: number },
  size: number,
  pattern: AvatarConcentric,
): number {
  const centre = size / 2;
  const dx = cell.x + 0.5 - centre;
  const dy = cell.y + 0.5 - centre;

  const exponent = required(CONCENTRIC_SHAPES[pattern.shape - 1], 'concentric shape').exponent;
  const base = shapeDistance(dx, dy, exponent);
  const petals = 1 + (pattern.lobeDepth / 10) * Math.cos(pattern.lobes * Math.atan2(dy, dx));

  /*
   * `max(0, …)` rather than a clamp on the input: at the deepest setting the rose term bottoms
   * out near zero but never below it, so this only ever guards against a rounding error at the
   * exact centre cell. Letting a negative distance through would wrap the innermost ring to the
   * outermost colour — one wrong pixel in the middle of a face, which is where people look.
   */
  const distance = Math.max(0, base * petals);
  return Math.floor(distance / pattern.ringWidth) % pattern.bands;
}

/** p=∞ is the square, and is `max` rather than `pow` because `pow` cannot express it. */
function shapeDistance(dx: number, dy: number, exponent: number): number {
  if (exponent === Infinity) return Math.max(Math.abs(dx), Math.abs(dy));
  if (exponent === 2) return Math.sqrt(dx * dx + dy * dy);
  return (Math.abs(dx) ** exponent + Math.abs(dy) ** exponent) ** (1 / exponent);
}
