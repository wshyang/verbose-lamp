// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it } from 'vitest';
import { alphaOf, planeOf } from './matte';
import { forgetSegmenter } from './segmentSubject';

describe('matte shapes and the segmenter loader', () => {
  afterEach(forgetSegmenter);

  it('reads both result shapes and rejects channel mismatches', () => {
    const rgba = { data: Uint8ClampedArray.from([9, 9, 9, 10, 9, 9, 9, 250]), width: 2, height: 1, channels: 4 };
    expect(Array.from(alphaOf(planeOf(rgba)!)!.data)).toEqual([10, 250]);
    expect(Array.from(alphaOf(planeOf([{ mask: { data: [5, 6], width: 2, height: 1, channels: 1 } }])!)!.data)).toEqual([5, 6]);
    expect(alphaOf({ data: [1, 2, 3, 4, 5, 6], width: 2, height: 1, channels: 3 })).toBeNull();
    expect(alphaOf({ data: [1, 2, 3], width: 2, height: 1 })).toBeNull();
    expect(planeOf(null)).toBeNull();
    // An object that carries neither an alpha image nor a mask is not a matte.
    expect(planeOf({})).toBeNull();
    expect(planeOf([{ width: 2, height: 1 }])).toBeNull();
    // A plane with no pixels cannot be a matte either, whatever its buffer holds.
    expect(alphaOf({ data: [], width: 0, height: 1 })).toBeNull();
    expect(alphaOf({ data: [1], width: 1.5, height: 1 })).toBeNull();
  });
});
