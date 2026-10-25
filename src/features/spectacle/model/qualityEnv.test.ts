// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectQualityEnv } from './quality';

describe('detectQualityEnv in a browser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the coarse-pointer query and the core count', () => {
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList);
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { configurable: true, value: 12 });

    expect(detectQualityEnv()).toEqual({ coarsePointer: true, cores: 12 });
    expect(media).toHaveBeenCalledWith('(pointer: coarse)');
  });

  it('assumes eight cores when the browser does not say', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', { configurable: true, value: undefined });

    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
