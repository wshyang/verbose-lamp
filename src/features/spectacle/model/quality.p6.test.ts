// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, afterEach, vi } from 'vitest';
import { detectQualityEnv } from './quality';

describe('detectQualityEnv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a desktop guess before there is a window', () => {
    vi.stubGlobal('window', undefined);

    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });

  it('reads the pointer type and the core count from the browser', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });
    vi.stubGlobal('navigator', { hardwareConcurrency: 12 });

    expect(detectQualityEnv()).toEqual({ coarsePointer: true, cores: 12 });
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });
});
