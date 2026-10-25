import { describe, expect, it } from 'vitest';
import { detectQualityEnv } from './quality';

/**
 * Node environment (the Vitest default): there is no `window`, so the stage must
 * assume a desktop-class device instead of throwing. Kept in its own file because
 * the rest of the suite runs in jsdom (ADDENDUM-028 §3).
 */
describe('detectQualityEnv without a window', () => {
  it('assumes eight cores and a fine pointer', () => {
    expect(typeof window).toBe('undefined');
    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
