import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
import type { FireworkShellType, OrbTransitionParams } from '../model/types';
import { hashText } from '../testing/recordingCanvas';
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

/**
 * Rounds floats to 6 decimal places before hashing. Math.sin/cos/sqrt can
 * differ in the last bit across CPU architectures, which previously made
 * these goldens pass on macOS and fail on Linux (ADDENDUM-025).
 */
function roundFloats(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6;
  if (Array.isArray(value)) return value.map(roundFloats);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, roundFloats(entry)]),
    );
  }
  return value;
}

function digest(value: unknown): { length: number; hash: string } {
  const text = JSON.stringify(roundFloats(value));
  return { length: text.length, hash: hashText(text) };
}

describe('planning golden snapshots', () => {
  it('planShow seed 1925 keeps its schedule', () => {
    expect(digest(planShow({ seed: 1925, intensity: 0.6 }))).toMatchSnapshot();
    expect(digest(planShow({ seed: 1925, finale: true, durationMs: 14000 }))).toMatchSnapshot();
  });

  for (const type of SHELL_TYPES) {
    it(`shellSparks ${type} keeps its recipe`, () => {
      expect(digest(shellSparks({ type, rng: mulberry32(1925), scale: 1, pistil: 'emerald' }))).toMatchSnapshot();
      expect(digest(shellSparks({ type, rng: mulberry32(1925), scale: 0.5, pistil: 'gold' }))).toMatchSnapshot();
    });
  }

  for (const config of ORB_CONFIGS) {
    it(`planOrbTransition ${config.pattern}/${config.direction} keeps its timeline`, () => {
      expect(digest(planOrbTransition(config))).toMatchSnapshot();
      expect(digest(planOrbCrossfade(config))).toMatchSnapshot();
    });
  }
});
