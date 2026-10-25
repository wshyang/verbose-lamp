import { mulberry32 } from '@/shared/lib/random';
import type { FrameFinish, FrameStyle, RailTone } from './types';

/**
 * Brass tone assignment for the movie finish (ADDENDUM-021 §3.6): the
 * tutorial alternates a dark and a light brass gradient per layer and
 * changes the gradient angle per layer, so the colour flow looks
 * hand-laid rather than printed. Angles are drawn from the composition
 * seed, keeping every reroll deterministic.
 */
export function latticeRailTone(layer: number, seed: number): RailTone {
  const angle = mulberry32(seed + (layer + 1) * 0x9e37)() * Math.PI;
  return { base: layer % 2 === 0 ? 0.25 : 0.75, angle };
}

/** Lattice-authored surfaces wear the tutorial's antique brass; everything else stays bright gold. */
export function frameFinishForStyle(style: FrameStyle): FrameFinish {
  if (style.formula.source === 'lattice') return 'brass';
  const layers = style.formula.layers ?? [];
  return layers.some((layer) => layer.enabled && layer.source === 'lattice') ? 'brass' : 'gold';
}
