import type { QualityPreference, QualitySettings, QualityTier } from './types';

export interface QualityEnv {
  coarsePointer: boolean;
  cores: number;
}

/** `auto` must be honest: coarse pointers and ≤4 cores get the low tier. */
export function resolveQuality(pref: QualityPreference, env: QualityEnv): QualityTier {
  if (pref !== 'auto') return pref;
  return env.coarsePointer || env.cores <= 4 ? 'low' : 'high';
}

/**
 * Canvas-compositor budgets (ADDENDUM-022 deviation from the GPU spark counts
 * in ADDENDUM-020 §3.1 — recorded in the implementation addendum).
 */
export function qualitySettings(tier: QualityTier): QualitySettings {
  if (tier === 'high') {
    return { tier, sparkCap: 6000, trailSamples: 7, persistence: 0.8, dprCap: 2, shellScale: 1 };
  }
  return { tier, sparkCap: 2000, trailSamples: 3, persistence: 0.5, dprCap: 1.25, shellScale: 0.5 };
}

export function detectQualityEnv(): QualityEnv {
  if (typeof window === 'undefined') return { coarsePointer: false, cores: 8 };
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    cores: navigator.hardwareConcurrency ?? 8,
  };
}