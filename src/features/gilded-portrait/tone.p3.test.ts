// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { boxBlur } from './tone';

describe('tone operations', () => {
  it('returns a copy when the buffer does not match the declared shape', () => {
    const source = new Float32Array([0, 0.5, 1]);
    const blurred = boxBlur(source, { width: 4, height: 3, radius: 2 });
    expect(Array.from(blurred)).toEqual(Array.from(source));
    expect(blurred).not.toBe(source);
  });
});
