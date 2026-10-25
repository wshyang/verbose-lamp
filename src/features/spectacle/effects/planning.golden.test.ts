import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
import type { FireworkShellType, OrbTransitionParams } from '../model/types';
import { hashText } from '../testing/recordingCanvas';
import { shellSparks } from './fireworks/shells';
import { planShow } from './fireworks/show';
import { planOrbTransition } from './orbs/orbPlan';

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

function digest(value: unknown): { length: number; hash: string } {
  const text = JSON.stringify(value);
  return { length: text.length, hash: hashText(text) };
}

describe('planning golden snapshots', () => {
  it('planShow seed 1925 keeps its schedule', () => {
    expect(digest(planShow({ seed: 1925, intensity: 0.6 }))).toMatchSnapshot();
    expect(digest(planShow({ seed: 1925, finale: true, durationMs: 14000 }))).toMatchSnapshot();
  });

  for (const type of SHELL_TYPES) {
    it(`shellSparks ${type} keeps its recipe`, () => {
      expect(digest(shellSparks(type, mulberry32(1925), 1, true))).toMatchSnapshot();
      expect(digest(shellSparks(type, mulberry32(1925), 0.5, false))).toMatchSnapshot();
    });
  }

  for (const config of ORB_CONFIGS) {
    it(`planOrbTransition ${config.pattern}/${config.direction} keeps its timeline`, () => {
      expect(digest(planOrbTransition(config, false))).toMatchSnapshot();
      expect(digest(planOrbTransition(config, true))).toMatchSnapshot();
    });
  }
});
