import { describe, expect, it } from 'vitest';
import { planSpin } from './spin';

const ROUND = 1e4;
const SAMPLE_FRACTIONS = [0.05, 0.25, 0.5, 0.75, 0.95, 1] as const;
const OPTION_SETS = [
  { name: 'full motion, 300 guests', options: { startP: 0, winnerIndex: 142, n: 300 } },
  { name: 'full motion, 2 guests', options: { startP: 0.4, winnerIndex: 1, n: 2 } },
  {
    name: 'reduced motion',
    options: { startP: 0, winnerIndex: 7, n: 30, accelMs: 350, decelMs: 700, minCruiseMs: 250, settle: false },
  },
] as const;

function rounded(value: number): number {
  return Math.round(value * ROUND) / ROUND;
}

describe('planSpin golden snapshots', () => {
  for (const { name, options } of OPTION_SETS) {
    it(`${name} keeps its profile`, () => {
      const profile = planSpin(options);
      const samples = SAMPLE_FRACTIONS.map((fraction) => ({
        position: rounded(profile.positionAt(profile.durationMs * fraction)),
        velocity: rounded(profile.velocityAt(profile.durationMs * fraction)),
      }));
      expect({ durationMs: Math.round(profile.durationMs), endP: profile.endP, samples }).toMatchSnapshot();
    });
  }
});
