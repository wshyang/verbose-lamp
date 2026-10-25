import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
import type { FireworkShellType, OrbTransitionParams } from '../model/types';
import { stableDigest } from '../testing/digest';
import { shellSparks } from './fireworks/shells';
import { planShow } from './fireworks/show';
import { planOrbCrossfade, planOrbTransition } from './orbs/orbPlan';

const ORIGIN = { x: 0.5, y: 0.5 } as const;
const SHELL_TYPES: readonly FireworkShellType[] = [
  'peony', 'chrysanthemum', 'willow', 'kamuro', 'palm', 'ring', 'crossette', 'strobe', 'double-break',
];
const ORB_CONFIGS: readonly OrbTransitionParams[] = [
  { origin: ORIGIN, pattern: 'sides', direction: 'outward' },
  { origin: ORIGIN, pattern: 'sides', direction: 'inward' },
  { origin: ORIGIN, pattern: 'corners', direction: 'outward' },
  { origin: ORIGIN, pattern: 'corners', direction: 'inward' },
];

describe('planning golden snapshots', () => {
  it('planShow seed 1925 keeps its schedule', () => {
    expect(stableDigest(planShow({ seed: 1925, intensity: 0.6 }))).toMatchSnapshot();
    expect(stableDigest(planShow({ seed: 1925, finale: true, durationMs: 14000 }))).toMatchSnapshot();
  });

  for (const type of SHELL_TYPES) {
    it(`shellSparks ${type} keeps its recipe`, () => {
      expect(stableDigest(shellSparks({ type, rng: mulberry32(1925), scale: 1, pistil: 'emerald' }))).toMatchSnapshot();
      expect(stableDigest(shellSparks({ type, rng: mulberry32(1925), scale: 0.5, pistil: 'gold' }))).toMatchSnapshot();
    });
  }

  for (const config of ORB_CONFIGS) {
    it(`planOrbTransition ${config.pattern}/${config.direction} keeps its timeline`, () => {
      expect(stableDigest(planOrbTransition(config))).toMatchSnapshot();
      expect(stableDigest(planOrbCrossfade(config))).toMatchSnapshot();
    });
  }
});
