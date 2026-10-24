import {
  SUNBURST_TWIST_STEP,
  type AvatarBackdropPattern,
  type AvatarSunburst,
} from '@psd/contracts';
import { concentricBandOfCell } from './concentric.js';
import { psychedelicBandOfCell } from './psychedelic.js';
import { wavesBandOfCell } from './waves.js';
import { required } from '../required.js';

/**
 * ADR-173 — the hypnotic radial sunburst, as a recolouring of backdrop cells.
 *
 * The algorithm is the one from the brief, with one change forced by this renderer: an avatar
 * here is not a canvas. It is a 64×64 grid of role keys that becomes merged `<path>` rectangles
 * in an SVG data URL (ADR-021/ADR-026), and a photo sprite is the same thing at 128×128. There
 * is no `ctx` to draw into — a canvas would have to be rasterised and re-indexed back into the
 * grid to be shown at all, and would lose the crisp pixel edges the whole art style rests on.
 *
 * So the polygon tracing inverts into a point test. Instead of walking each ray's leading and
 * trailing edge outwards and filling the shape between them, every backdrop cell asks which ray
 * it is standing in. The geometry is identical — the same `θ + r·curvature` — but asked per
 * pixel rather than per edge, which for a grid this size is both simpler and exact: no step
 * resolution to tune, no seams between adjacent polygons, and no anti-aliasing to fight.
 *
 * What is kept from the brief:
 *   - the angle is dragged sideways in proportion to distance, which is what makes it spiral;
 *   - rays and gaps alternate at equal width, so `rayCount` rays means `rayCount` gaps.
 */

/**
 * ADR-206 — the key a cell takes in each band, in band order.
 *
 * Two entries is the original ray/gap split. More than two and the middle entries are bands
 * whose colours are interpolated between the two ends, so the list is always "first colour …
 * last colour" and never a set of independent choices.
 */
export type SunburstKeys = readonly string[];

/**
 * Which band of its sector a cell falls in, once the spiral has dragged it round.
 *
 * The half-cell offset puts the sample at the middle of the pixel rather than its corner, which
 * keeps the pattern symmetric about the centre instead of leaning half a cell up and to the left.
 *
 * ADR-206 generalised this from a boolean. At two bands `floor(phase × 2)` is 0 exactly where
 * `phase < 0.5` was true, so a spiral drawn before bands existed draws the same cells now — not
 * approximately, identically, and `avatars.test.ts` walks the whole legacy space to say so.
 */
export function bandOfCell(
  cell: { x: number; y: number },
  size: number,
  sunburst: AvatarSunburst,
): number {
  const centre = size / 2;
  const dx = cell.x + 0.5 - centre;
  const dy = cell.y + 0.5 - centre;
  const radius = Math.sqrt(dx * dx + dy * dy);

  // The brief's `θ_dynamic = θ_base + distance × spiralForce`.
  const curvature = sunburst.twist * SUNBURST_TWIST_STEP;
  const angle = Math.atan2(dy, dx) + radius * curvature;

  // One sector is the full run of bands, so a cell's band is where it sits within its sector.
  const sector = (angle / (Math.PI * 2)) * sunburst.rays;
  const phase = ((sector % 1) + 1) % 1;
  return Math.min(sunburst.bands - 1, Math.floor(phase * sunburst.bands));
}

/**
 * ADR-207 — the ONE place that knows which patterns exist.
 *
 * Each pattern is a self-contained function that knows nothing of the others; this is the only
 * switch, and it is a switch over a discriminated union, so adding a pattern without wiring it
 * here will not compile. The alternative — a `kind` check inside each generator — is how two
 * patterns end up sharing a bug.
 */
function bandOfCellFor(
  cell: { x: number; y: number },
  size: number,
  pattern: AvatarBackdropPattern,
): number {
  if (pattern.kind === 'concentric') return concentricBandOfCell(cell, size, pattern);
  if (pattern.kind === 'waves') return wavesBandOfCell(cell, size, pattern);
  if (pattern.kind === 'psychedelic') return psychedelicBandOfCell(cell, size, pattern);
  return bandOfCell(cell, size, pattern);
}

/**
 * Splits the backdrop cells of a grid into ray cells and gap cells.
 *
 * `mapping` says, for each key that counts as backdrop, the key each of its bands should take.
 * The drawn avatar passes two entries — the backdrop base and its vignette shade — so the
 * existing darkening at the edge of the portrait survives the effect instead of being flattened
 * by it. A photo sprite passes one.
 *
 * Returns new rows; the input is not touched, because the drawn grid is cached per layer and a
 * sprite's rows are parsed once and reused.
 */
export function splitBackdropCells(
  rows: readonly string[],
  mapping: ReadonlyMap<string, SunburstKeys>,
  sunburst: AvatarBackdropPattern,
): string[] {
  const size = rows.length;
  return rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < row.length; x += 1) {
      const key = row.charAt(x);
      const keys = mapping.get(key);
      if (keys === undefined) {
        out += key;
        continue;
      }
      /*
       * Clamped to the keys actually offered, not to the band count. A caller that hands over
       * fewer keys than there are bands is asking for a pattern it cannot paint, and the honest
       * answer is the last colour it did supply rather than a hole in the face.
       */
      const band = Math.min(keys.length - 1, bandOfCellFor({ x, y }, size, sunburst));
      out += required(keys[band], 'band key');
    }
    return out;
  });
}
