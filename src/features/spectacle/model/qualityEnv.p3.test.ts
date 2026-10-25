// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectQualityEnv } from './quality';

afterEach(() => {
  vi.unstubAllGlobals();
});
describe('detectQualityEnv', () => {
  it('reads the coarse-pointer pref and the core count', () => {
    expect(detectQualityEnv()).toEqual({
      coarsePointer: false,
      cores: navigator.hardwareConcurrency,
    });
  });

  it('assumes eight cores when the browser hides hardwareConcurrency', () => {
    const original = navigator.hardwareConcurrency;
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: undefined, configurable: true });
    expect(detectQualityEnv().cores).toBe(8);
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: original, configurable: true });
  });

  it('assumes no coarse pointer without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
