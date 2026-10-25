import { describe, expect, it } from 'vitest';
import { canvasSourceOf } from './locateFace';

describe('canvasSourceOf without a document', () => {
  it('returns null in a non-DOM runtime', () => {
    expect(typeof document).toBe('undefined');
    expect(canvasSourceOf({ width: 1, height: 1, data: new Uint8ClampedArray(4) })).toBeNull();
  });
});
