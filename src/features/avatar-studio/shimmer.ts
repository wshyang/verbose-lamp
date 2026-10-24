import type { RasterDimensions, RgbaImage } from '@/shared/lib/raster';
import type { ComposedAvatar } from './types';

/**
 * Metal-aware shimmer, lifted from avatar-studio implementation B (ADDENDUM-019).
 *
 * A specular glint sweeps diagonally across the avatar and every pixel catches it in
 * proportion to how metallic it is: gold wires, leaf, rim and outline flare; enamel barely
 * moves; natural skin never does. B re-rendered the whole backdrop per phase; here the
 * composite already carries a metal map, so a frame is one multiply-add per metal pixel.
 */
export const SHIMMER_FRAMES = 12;
const HIGHLIGHT = [255, 246, 220] as const;
/** B's glint: a Gaussian band 0.08 wide that travels 1.4 panel-diagonals per loop. */
const GLINT_WIDTH = 0.08;
const GLINT_TRAVEL = 1.4;
const GLINT_STRENGTH = 0.6;
/** Below this the change rounds away; skipping keeps frames cheap and matte pixels exact. */
const MIN_LIGHT = 0.004;

/** Glint intensity for each diagonal (x + y) at one phase in [0, 1). */
export function glintProfile(dims: RasterDimensions, phase: number): Float32Array {
  const span = dims.width + dims.height;
  return Float32Array.from({ length: span - 1 }, (_, diagonal) => {
    const position = (diagonal + 1) / span - phase * GLINT_TRAVEL;
    const sweep = position - Math.floor(position);
    return Math.exp(-(((sweep - 0.5) / GLINT_WIDTH) ** 2));
  });
}

/** One frame of light on the still. Never mutates the still. */
export function shimmerFrame(avatar: ComposedAvatar, phase: number): RgbaImage {
  const { width, height, data } = avatar.image;
  const profile = glintProfile(avatar.image, phase);
  const metal = avatar.metal.data;
  const output = new Uint8ClampedArray(data);
  for (let pixel = 0; pixel < metal.length; pixel += 1) {
    const light = (metal[pixel] / 255) * profile[(pixel % width) + Math.floor(pixel / width)] * GLINT_STRENGTH;
    if (light < MIN_LIGHT) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] = Math.round(data[offset + channel] + (HIGHLIGHT[channel] - data[offset + channel]) * light);
    }
  }
  return { width, height, data: output };
}

/** A full loop of frames at evenly spaced phases (played ping-pong by the preview). */
export function shimmerFrames(avatar: ComposedAvatar, count = SHIMMER_FRAMES): RgbaImage[] {
  const total = Math.max(1, Math.round(count));
  return Array.from({ length: total }, (_, index) => shimmerFrame(avatar, index / total));
}
