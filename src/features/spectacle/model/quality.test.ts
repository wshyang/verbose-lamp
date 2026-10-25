import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectQualityEnv, qualitySettings, resolveQuality } from './quality';

describe('resolveQuality', () => {
  it('auto picks low on coarse pointers or weak CPUs', () => {
    expect(resolveQuality('auto', { coarsePointer: true, cores: 16 })).toBe('low');
    expect(resolveQuality('auto', { coarsePointer: false, cores: 4 })).toBe('low');
    expect(resolveQuality('auto', { coarsePointer: false, cores: 8 })).toBe('high');
  });

  it('explicit tiers win over the environment', () => {
    expect(resolveQuality('high', { coarsePointer: true, cores: 2 })).toBe('high');
    expect(resolveQuality('low', { coarsePointer: false, cores: 32 })).toBe('low');
  });

  it('low tier halves the budgets', () => {
    const hi = qualitySettings('high');
    const lo = qualitySettings('low');
    expect(lo.sparkCap).toBeLessThan(hi.sparkCap);
    expect(lo.trailSamples).toBeLessThan(hi.trailSamples);
    expect(lo.dprCap).toBeLessThanOrEqual(1.25);
  });
});

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

  it('assumes eight cores when the browser will not say', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('navigator', {});

    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
