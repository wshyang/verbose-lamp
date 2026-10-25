import { hash01 } from '@/shared/lib/random';

/**
 * Brass tone per tutorial layer (ADDENDUM-021 §3.6). The lower the layer, the
 * darker it sits: the tutorial's per-layer drop shadow, expressed as material
 * values so the WebGL and SVG renderers agree.
 */
export const LAYER_TONES = [1, 0.82, 0.68, 0.54] as const;

const FULL_CIRCLE_DEG = 360;
const ANGLE_STRIDE = 17;
const ANGLE_OFFSET = 3;

/** The layer's base tone, 0..1 (1 = brightest brass). */
export function toneForLayer(layer: number): number {
  const index = Math.min(LAYER_TONES.length - 1, Math.max(0, Math.round(layer)));
  return LAYER_TONES[index];
}

/**
 * The layer's gradient angle in degrees, derived from the seed so a reroll tilts
 * the raking light as well as the pattern. Deterministic: same seed, same tilt.
 */
export function brassAngleFor(seed: number, layer: number): number {
  return Math.round(hash01(seed, layer * ANGLE_STRIDE + ANGLE_OFFSET) * FULL_CIRCLE_DEG);
}
