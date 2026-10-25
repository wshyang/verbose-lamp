import { describe, expect, it } from 'vitest';
import { buildShapeMask, chokeMask } from './mask';

function coveredPixels(data: Uint8ClampedArray): number {
  return data.reduce((count, alpha) => count + Number(alpha > 0), 0);
}

describe('portrait masks', () => {
  it('keeps the oval centre opaque and clears pixels outside its edge', () => {
    const mask = buildShapeMask({ width: 21, height: 21, shape: 'oval', feather: 0 });

    expect(mask.data[10 * mask.width + 10]).toBe(255);
    expect(mask.data[0]).toBe(0);
  });

  it('shrinks the visible area when a mask is choked', () => {
    const mask = buildShapeMask({ width: 32, height: 32, shape: 'rounded-rect', feather: 0 });
    const choked = chokeMask(mask, 3);

    expect(coveredPixels(choked.data)).toBeLessThan(coveredPixels(mask.data));
    expect(choked.data).not.toBe(mask.data);
  });

  it('feathers monotonically from the oval boundary toward its centre', () => {
    const mask = buildShapeMask({ width: 32, height: 32, shape: 'oval', feather: 0.2 });
    const row = 16;
    const samples = Array.from({ length: 17 }, (_, x) => mask.data[row * mask.width + x]);

    expect(samples[0]).toBe(0);
    expect(samples.some((value) => value > 0 && value < 255)).toBe(true);
    expect(samples[16]).toBe(255);
    expect(samples.slice(1).every((value, index) => value >= samples[index])).toBe(true);
  });
});

describe('portrait mask degenerate inputs', () => {
  it('builds an empty mask for non-finite dimensions', () => {
    const noWidth = buildShapeMask({ width: Number.NaN, height: 4, shape: 'oval', feather: 0.1 });
    expect([noWidth.width, noWidth.data.length]).toEqual([0, 0]);
    const noHeight = buildShapeMask({ width: 4, height: Infinity, shape: 'oval', feather: 0.1 });
    expect([noHeight.height, noHeight.data.length]).toEqual([0, 0]);
  });

  it('treats a non-finite feather as a hard edge', () => {
    const soft = buildShapeMask({ width: 9, height: 9, shape: 'oval', feather: Number.NaN });
    const hard = buildShapeMask({ width: 9, height: 9, shape: 'oval', feather: 0 });
    expect(soft.data).toEqual(hard.data);
  });

  it('copies the mask when the choke radius is not a number', () => {
    const mask = buildShapeMask({ width: 9, height: 9, shape: 'oval', feather: 0 });
    const choked = chokeMask(mask, Number.NaN);
    expect(choked.data).toEqual(mask.data);
    expect(choked.data).not.toBe(mask.data);
  });

  it('clears the whole mask when the choke swallows it', () => {
    const solid = buildShapeMask({ width: 4, height: 4, shape: 'none', feather: 0 });
    expect(coveredPixels(chokeMask(solid, 2).data)).toBe(0);
    const wide = buildShapeMask({ width: 10, height: 4, shape: 'none', feather: 0 });
    expect(coveredPixels(chokeMask(wide, 2).data)).toBe(0);
  });
});
