import { mulberry32 } from '@/shared/lib/random';

export interface SearchlightBeam {
  baseX: number;
  phase: number;
  speed: number;
  amplitude: number;
}

export function planSearchlights(count: number, seed: number): readonly SearchlightBeam[] {
  const rng = mulberry32(seed);
  const n = Math.min(4, Math.max(2, count));
  return Array.from({ length: n }, (_, i) => ({
    baseX: (i + 1) / (n + 1),
    phase: rng() * Math.PI * 2,
    speed: 0.35 + rng() * 0.3,
    amplitude: 0.38 + rng() * 0.18,
  }));
}

/** Beam angle in radians; −π/2 points straight up. Cross at climax → 1. */
export function beamAngleAt(beam: SearchlightBeam, tSec: number, climax: number): number {
  const sweep = -Math.PI / 2 + Math.sin(tSec * beam.speed + beam.phase) * beam.amplitude;
  const aim = Math.atan2(0.25 - 1.05, 0.5 - beam.baseX);
  return sweep + (aim - sweep) * climax;
}