import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
import type { FireworkShellType, SparklerTransitionParams } from '../model/types';
import { hashText } from '../testing/recordingCanvas';
import { shellSparks } from './fireworks/shells';
import { planShow } from './fireworks/show';
import { planSparklerCrossfade, planSparklerTransition } from './sparklers/sparklerPlan';

const ORIGIN = { x: 0.5, y: 0.5 } as const;
const SHELL_TYPES: readonly FireworkShellType[] = [
  'peony', 'chrysanthemum', 'willow', 'kamuro', 'palm', 'ring', 'crossette', 'strobe', 'double-break',
];
const SPARKLER_CONFIGS: readonly SparklerTransitionParams[] = [
  { origin: ORIGIN, pattern: 'sides', direction: 'outward' },
  { origin: ORIGIN, pattern: 'sides', direction: 'inward' },
  { origin: ORIGIN, pattern: 'corners', direction: 'outward' },
  { origin: ORIGIN, pattern: 'corners', direction: 'inward' },
];

function digest(value: unknown): { length: number; hash: string } {
  // Trig differs by 1 ulp across JS engines; 10 dp keeps the golden stable
  // without hiding any visually meaningful planning change.
  const text = JSON.stringify(value, (_key, entry: unknown) => (
    typeof entry === 'number' ? Math.round(entry * 1e10) / 1e10 : entry
  ));
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

  for (const config of SPARKLER_CONFIGS) {
    it(`planSparklerTransition ${config.pattern}/${config.direction} keeps its timeline`, () => {
      expect(digest(planSparklerTransition(config))).toMatchSnapshot();
      expect(digest(planSparklerCrossfade(config))).toMatchSnapshot();
    });
  }
});
