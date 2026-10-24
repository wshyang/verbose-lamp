import { describe, expect, it } from 'vitest';
import { fitWithin } from './fit';

describe('fitWithin', () => {
  it('preserves aspect ratio while constraining the long edge', () => {
    expect(fitWithin(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
    expect(fitWithin(600, 1200, 800)).toEqual({ width: 400, height: 800 });
  });

  it('does not upscale and rejects invalid dimensions without throwing', () => {
    expect(fitWithin(640, 480, 1024)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(0, 480, 1024)).toEqual({ width: 0, height: 0 });
  });
});