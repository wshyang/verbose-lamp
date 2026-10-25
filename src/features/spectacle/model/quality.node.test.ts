import { describe, expect, it } from 'vitest';
import { detectQualityEnv } from './quality';

describe('detectQualityEnv without a window', () => {
  it('uses the desktop fallback', () => {
    expect(typeof window).toBe('undefined');
    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
