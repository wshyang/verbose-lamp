import { decomposeNineSlice } from '@/features/deco-lattice';
import { buildLatticeRails } from './latticeSource';
import type { PolylineSpec } from './types';

/**
 * The Deco Lattice screen-border proscenium (ADDENDUM-021 §3.5.3), authored
 * in the same unit viewport space as `edgeBorder` (y in [-1, 1],
 * x in [-aspect, aspect]). A nine-slice decomposition defines the clear
 * centre; lattice rails are scaled from world widths to border widths.
 */

export interface LatticeBorderRequest {
  aspect: number;
  /** 0..1 — maps to lattice recipe depth 1..4. */
  density: number;
  seed?: number;
}

const WIDTH_SCALE = 0.22;
const Z_SCALE = 0.15;

function toBorderRail(spec: PolylineSpec): PolylineSpec {
  const width = spec.width * WIDTH_SCALE;
  return {
    ...spec,
    points: spec.points.map((p) => ({ x: p.x, y: p.y })),
    width,
    depth: Math.max(width * 1.7, 0.012),
    z: spec.z * Z_SCALE,
  };
}

export function buildLatticeBorder({ aspect, density, seed }: LatticeBorderRequest): PolylineSpec[] {
  const slice = decomposeNineSlice({ hw: aspect, hh: 1, cornerRatio: 0.28 });
  const level = 1 + Math.round(Math.min(1, Math.max(0, density)) * 3);
  const rails = buildLatticeRails({ box: { hw: aspect, hh: 1 }, level, seed, density });
  // The lattice adapter's own aperture already contains the nine-slice clear
  // centre in y; drop anything still crossing the nine-slice aperture in x.
  return rails
    .filter((spec) => spec.points.some(
      (p) => Math.abs(p.x) >= slice.aperture.hw || Math.abs(p.y) >= slice.aperture.hh,
    ))
    .map(toBorderRail);
}
