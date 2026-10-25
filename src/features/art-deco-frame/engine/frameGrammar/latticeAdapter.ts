import type { DecoLatticeGeometry, LatticeSpec } from '@/features/deco-lattice';
import type { PolylineSpec, RailKind } from './types';

/**
 * Deco Lattice → title/border rails (ADDENDUM-021 §3.5). The lattice engine
 * stays in its own feature with its own spec type; this adapter is the one
 * place that knows how a tutorial layer maps onto the frame grammar's
 * kinds, z-steps and draw-on delays, so both the title cards and the screen
 * border can consume it through the existing rail renderer.
 */

export interface LatticeRailScale {
  /** Multiplier for lattice coordinates. */
  coordScale: number;
  /** Multiplier for lattice stroke widths. */
  widthScale: number;
}

const LAYER_Z = -0.02;
const LAYER_DELAY = 0.06;

function railKindFor(spec: LatticeSpec): RailKind {
  switch (spec.layer) {
    case 0:
      return spec.rank === 0 ? 'frame' : 'rule';
    case 1:
      return 'star';
    case 2:
      return 'lattice';
    case 3:
      return spec.rank === 3 ? 'reed' : 'diamond';
  }
}

export function latticeToRails(
  geometry: DecoLatticeGeometry,
  scale: LatticeRailScale,
): PolylineSpec[] {
  return geometry.specs.map((spec) => ({
    points: spec.points.map((point) => ({
      x: point.x * scale.coordScale,
      y: point.y * scale.coordScale,
    })),
    closed: spec.closed ?? false,
    width: Math.max(0.004, spec.width * scale.widthScale),
    depth: 0.09,
    z: LAYER_Z * spec.layer,
    delay: Math.min(0.6, spec.layer * LAYER_DELAY + spec.rank * 0.015),
    // Full-frame rails part by vertex position, like centred authored rails.
    partDir: 0,
    kind: railKindFor(spec),
    rank: spec.rank,
  }));
}
