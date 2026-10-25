// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildDecoLattice } from './composition';
import { traceWalks } from './walk';

describe('traceWalks', () => {
  it('actually walks (regression: the 3x3 reservation used to fence the head in)', () => {
    const walks = traceWalks({ seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 10, minRun: 2 });
    expect(walks.length).toBeGreaterThanOrEqual(1);
    for (const walk of walks) expect(walk.length).toBeGreaterThanOrEqual(2);
  });
});
describe('frame mode seed', () => {
  it('uses the signature seed 1925 when the caller omits one', () => {
    const seedless = buildDecoLattice({ mode: 'frame', hw: 1.78, hh: 1, level: 2 });
    const explicit = buildDecoLattice({ mode: 'frame', hw: 1.78, hh: 1, seed: 1925, level: 2 });
    expect(seedless).toEqual(explicit);
  });
});
describe('traceWalks across seeds', () => {
  it('finds walks for a spread of seeds (every turn weight gets exercised)', () => {
    let total = 0;
    for (let seed = 1; seed <= 64; seed += 1) {
      total += traceWalks({ seed, cell: 0.015, inner: 0.58, outer: 0.9, count: 10, minRun: 2 }).length;
    }
    expect(total).toBeGreaterThanOrEqual(64);
  });
});
