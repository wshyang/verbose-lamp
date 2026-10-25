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
describe('mask guards', () => {
  it('falls back to zero for a non-finite size, feather or choke radius', () => {
    const empty = buildShapeMask({ width: Number.NaN, height: 10, shape: 'oval', feather: 0 });
    expect(empty).toMatchObject({ width: 0, height: 10 });
    expect(empty.data.length).toBe(0);

    const flat = buildShapeMask({ width: 8, height: Number.POSITIVE_INFINITY, shape: 'oval', feather: 0 });
    expect(flat).toMatchObject({ width: 8, height: 0 });
    expect(flat.data.length).toBe(0);

    const noFeather = buildShapeMask({ width: 8, height: 8, shape: 'oval', feather: Number.POSITIVE_INFINITY });
    expect(noFeather.data[4 * 8 + 4]).toBe(255);

    const mask = buildShapeMask({ width: 8, height: 8, shape: 'oval', feather: 0 });
    const unchoked = chokeMask(mask, Number.NaN);
    expect(unchoked.data).toEqual(mask.data);
  });

  it('clears the mask when the choke radius swallows it whole', () => {
    const mask = buildShapeMask({ width: 6, height: 6, shape: 'oval', feather: 0 });
    const swallowed = chokeMask(mask, 3);
    expect(swallowed.width).toBe(6);
    expect(swallowed.data.every((alpha) => alpha === 0)).toBe(true);
    expect(swallowed.data).not.toBe(mask.data);
  });
});
