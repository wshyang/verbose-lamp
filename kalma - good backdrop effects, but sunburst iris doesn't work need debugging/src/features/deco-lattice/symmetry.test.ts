import { describe, expect, it } from 'vitest';
import type { LatticeSpec } from './lattice';
import { D2, D4, inWedge, orbit } from './symmetry';

const generic: LatticeSpec = {
  points: [{ x: 0.7, y: 0.2 }, { x: 0.8, y: 0.3 }], width: 0.01, layer: 2, rank: 2,
};
const onMirror: LatticeSpec = {
  points: [{ x: 0.7, y: 0 }, { x: 0.8, y: 0 }], width: 0.01, layer: 2, rank: 2,
};
const onDiagonal: LatticeSpec = {
  points: [{ x: 0.6, y: 0.6 }, { x: 0.7, y: 0.7 }], width: 0.01, layer: 2, rank: 2,
};

describe('orbit', () => {
  it('generic content orbits to 8 under D4 and 4 under D2', () => {
    expect(orbit([generic], D4).length).toBe(8);
    expect(orbit([generic], D2).length).toBe(4);
  });

  it('mirror-line content dedupes to 4 (axis) and 4 (diagonal) under D4', () => {
    expect(orbit([onMirror], D4).length).toBe(4);
    expect(orbit([onDiagonal], D4).length).toBe(4);
    expect(orbit([onMirror], D2).length).toBe(2);
  });

  it('wedge test accepts 0 ≤ y ≤ x only', () => {
    expect(inWedge({ x: 0.8, y: 0.3 })).toBe(true);
    expect(inWedge({ x: 0.3, y: 0.8 })).toBe(false);
    expect(inWedge({ x: 0.8, y: -0.1 })).toBe(false);
  });
});