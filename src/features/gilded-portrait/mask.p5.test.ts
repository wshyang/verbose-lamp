// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildShapeMask, chokeMask } from './mask';

function coveredPixels_p5(data: Uint8ClampedArray): number {
  return data.reduce((count, alpha) => count + Number(alpha > 0), 0);
}
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
    expect(coveredPixels_p5(chokeMask(solid, 2).data)).toBe(0);
    const wide = buildShapeMask({ width: 10, height: 4, shape: 'none', feather: 0 });
    expect(coveredPixels_p5(chokeMask(wide, 2).data)).toBe(0);
  });
});
