// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildShapeMask, chokeMask } from './mask';

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
