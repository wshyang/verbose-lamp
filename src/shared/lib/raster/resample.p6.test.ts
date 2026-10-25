// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { cropSquare } from './resample';

describe('assertSampling guards', () => {
  const plane = { width: 2, height: 2, channels: 4, data: new Uint8ClampedArray(16) };

  it('rejects a crop box with no size', () => {
    expect(() => cropSquare(plane, { x: 0, y: 0, size: 0 }, 4)).toThrow(RangeError);
    expect(() => cropSquare(plane, { x: 0, y: 0, size: Number.NaN }, 4)).toThrow(RangeError);
  });

  it('rejects a buffer whose length disagrees with its dimensions', () => {
    const broken = { ...plane, data: new Uint8ClampedArray(4) };

    expect(() => cropSquare(broken, { x: 0, y: 0, size: 2 }, 4)).toThrow(
      /does not match its dimensions/
    );
  });
});
