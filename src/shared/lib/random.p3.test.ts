// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';
import { randomIndex } from './random';

describe('randomIndex', () => {
  it('maps a filled buffer into the requested range', () => {
    expect(randomIndex(7, () => new Uint32Array([20]))).toBe(6);
    expect(randomIndex(1, () => new Uint32Array([0]))).toBe(0);
  });

  it('asks the caller for one word of entropy', () => {
    const fill = vi.fn((buffer: Uint32Array) => buffer);
    randomIndex(3, fill);
    expect(fill).toHaveBeenCalledWith(expect.any(Uint32Array));
    expect(fill.mock.calls[0][0]).toHaveLength(1);
  });
});
