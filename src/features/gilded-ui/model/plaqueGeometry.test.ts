import { describe, expect, it } from 'vitest';
import { chamferPlaque, plaquePinstripe } from './plaqueGeometry';

describe('plaqueGeometry', () => {
  it('chamfer path snapshot', () => {
    expect(chamferPlaque(100, 60, 10)).toBe(
      'M10 0 L90 0 L100 10 L100 50 L90 60 L10 60 L0 50 L0 10 Z',
    );
  });

  it('pinstripe insets symmetrically', () => {
    expect(plaquePinstripe(100, 60, 10, 4)).toBe(
      'M6 0 L86 0 L92 6 L92 46 L86 52 L6 52 L0 46 L0 6 Z',
    );
  });
});