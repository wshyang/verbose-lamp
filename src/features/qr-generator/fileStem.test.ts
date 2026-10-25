import { describe, expect, it } from 'vitest';
import { toSafeFileStem } from './fileStem';

describe('toSafeFileStem', () => {
  it('slugifies a caption with interpuncts and accents', () => {
    expect(toSafeFileStem('ADMIT ONE · WEST EGG')).toBe('admit-one-west-egg');
    expect(toSafeFileStem('Café Daisy — 1922')).toBe('cafe-daisy-1922');
  });

  it('falls back when nothing printable remains', () => {
    expect(toSafeFileStem('✦ ✦ ✦')).toBe('golden-qr');
    expect(toSafeFileStem('', 'plaque')).toBe('plaque');
  });

  it('caps the stem length for filesystem friendliness', () => {
    expect(toSafeFileStem('g'.repeat(80))).toHaveLength(48);
  });
});
