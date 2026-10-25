// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
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
});
