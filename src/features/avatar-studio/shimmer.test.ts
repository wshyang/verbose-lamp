import { describe, expect, it } from 'vitest';
import { SHIMMER_FRAMES, glintProfile, shimmerFrame, shimmerFrames } from './shimmer';
import type { ComposedAvatar } from './types';

/** A 32² "emerald plaque": the left half polished gold (metal 255), the right half matte enamel. */
function emeraldPlaque(): ComposedAvatar {
  const size = 32;
  const image = new Uint8ClampedArray(size * size * 4);
  const metal = new Uint8ClampedArray(size * size);
  for (let pixel = 0; pixel < size * size; pixel += 1) {
    image.set([30, 110, 80, pixel % 7 === 0 ? 128 : 255], pixel * 4);
    metal[pixel] = pixel % size < size / 2 ? 255 : 0;
  }
  return { image: { width: size, height: size, data: image }, metal: { width: size, height: size, data: metal } };
}

describe('shimmer', () => {
  const plaque = emeraldPlaque();
  const frames = shimmerFrames(plaque);

  it('produces the requested number of deterministic frames', () => {
    expect(frames).toHaveLength(SHIMMER_FRAMES);
    expect(Array.from(shimmerFrame(plaque, 0.25).data)).toEqual(Array.from(frames[3].data));
  });

  it('never touches matte pixels, alpha, or the still itself', () => {
    const before = Array.from(plaque.image.data);
    for (const frame of frames) {
      for (let pixel = 0; pixel < 32 * 32; pixel += 1) {
        const offset = pixel * 4;
        expect(frame.data[offset + 3]).toBe(plaque.image.data[offset + 3]);
        if (plaque.metal.data[pixel] === 0) expect(Array.from(frame.data.slice(offset, offset + 3))).toEqual([30, 110, 80]);
      }
    }
    expect(Array.from(plaque.image.data)).toEqual(before);
  });

  it('flares polished gold as the glint passes', () => {
    const corner = (5 * 32 + 5) * 4;
    const brightest = Math.max(...frames.map((frame) => frame.data[corner]));
    expect(brightest).toBeGreaterThan(plaque.image.data[corner] + 60);
  });

  it('peaks the glint at full strength in the middle of its band', () => {
    const profile = Array.from(glintProfile({ width: 32, height: 32 }, 0));
    expect(Math.max(...profile)).toBeGreaterThan(0.95);
    expect(Math.min(...profile)).toBeLessThan(0.01);
  });
});
