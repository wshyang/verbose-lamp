// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildShapeMask, chokeMask } from './mask';

describe('chokeMask edge cases', () => {
  it('empties the mask entirely when the choke would eat the whole frame', () => {
    // Choking by half the width leaves nothing of a 4 px mask; returning a
    // zero-filled buffer is the honest answer, not a clamped ring.
    const mask = buildShapeMask({ width: 4, height: 4, shape: 'none', feather: 0 });
    mask.data.fill(255);

    const choked = chokeMask(mask, 2);

    expect(choked.width).toBe(4);
    expect(Array.from(choked.data).every((value) => value === 0)).toBe(true);
  });

  it('treats a non-finite or negative radius as no choke at all', () => {
    const mask = buildShapeMask({ width: 4, height: 4, shape: 'none', feather: 0 });
    mask.data.fill(255);

    for (const radius of [Number.NaN, -3]) {
      const kept = chokeMask(mask, radius);
      expect(Array.from(kept.data)).toEqual(Array.from(mask.data));
      expect(kept.data).not.toBe(mask.data); // a copy, so the caller can mutate it
    }
  });
});
