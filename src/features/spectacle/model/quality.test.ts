import { describe, expect, it } from 'vitest';
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
describe('detectQualityEnv outside a browser', () => {
  it('assumes a fine pointer and eight cores', () => {
    expect(detectQualityEnv()).toEqual({ coarsePointer: false, cores: 8 });
  });
});
