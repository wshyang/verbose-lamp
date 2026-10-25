// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { boxBlur } from './tone';

describe('tone degenerate inputs', () => {
  it('returns a copy when the values do not form the declared raster', () => {
    const values = new Float32Array([1, 2, 3]);
    const blurred = boxBlur(values, { width: 2, height: 2, radius: 1 });
    expect(Array.from(blurred)).toEqual([1, 2, 3]);
    expect(blurred).not.toBe(values);
  });
});
