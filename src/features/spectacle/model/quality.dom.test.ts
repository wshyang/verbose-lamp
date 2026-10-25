// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { detectQualityEnv } from './quality';

function setEnv(matches: boolean, cores: number | undefined): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
  Object.defineProperty(window.navigator, 'hardwareConcurrency', {
    configurable: true,
    value: cores,
  });
}

describe('detectQualityEnv in a browser', () => {
  it('reads the pointer media query and the core count', () => {
    setEnv(true, 2);
    expect(detectQualityEnv()).toEqual({ coarsePointer: true, cores: 2 });
  });

  it('assumes eight cores when the browser will not say', () => {
    setEnv(false, undefined);
    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
