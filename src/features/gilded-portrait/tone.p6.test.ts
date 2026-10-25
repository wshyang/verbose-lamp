// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { boxBlur } from './tone';

describe('boxBlur edge cases', () => {
  it('copies the buffer when the shape does not describe the data', () => {
    const values = new Float32Array([1, 2, 3, 4]);

    const out = boxBlur(values, { width: 3, height: 3, radius: 2 });

    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
    expect(out).not.toBe(values);
  });
});
