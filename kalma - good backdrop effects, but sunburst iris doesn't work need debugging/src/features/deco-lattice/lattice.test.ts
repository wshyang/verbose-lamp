import { describe, expect, it } from 'vitest';
import { isOctilinear, snapToLattice } from './lattice';
import { axisArrow, cornerSteps, diagonalArm, reedRow, steppedBorder, trapezoidClasp } from './motifs';

describe('lattice', () => {
  it('snap is idempotent', () => {
    const p = snapToLattice({ x: 0.317, y: -0.734 }, 0.05);
    expect(snapToLattice(p, 0.05)).toEqual(p);
  });

  it('every axis/diagonal motif is octilinear', () => {
    expect(isOctilinear(cornerSteps(1, 1, 3, 0.06))).toBe(true);
    expect(isOctilinear([...steppedBorder(1, 1, 2, 0.06), steppedBorder(1, 1, 2, 0.06)[0]])).toBe(true);
    expect(isOctilinear([...trapezoidClasp(0.9, 0.12), { x: -0.45, y: 0 }])).toBe(true);
    expect(isOctilinear(axisArrow(0.5, 0.12))).toBe(true);
    expect(isOctilinear([...diagonalArm(0.38, 0.05), diagonalArm(0.38, 0.05)[0]])).toBe(true);
  });

  it('rejects a non-octilinear segment', () => {
    expect(isOctilinear([{ x: 0, y: 0 }, { x: 1, y: 0.4 }])).toBe(false);
  });
});

describe('reedRow equal gaps', () => {
  it('both end gaps equal the exact gap g′', () => {
    const rows = reedRow({ from: { x: -0.5, y: 0 }, to: { x: 0.5, y: 0 }, tickLen: 0.07, barW: 0.012, gap: 0.03 });
    const n = rows.length;
    const g = (1 - n * 0.012) / (n + 1);
    const firstCentre = rows[0][0].x;
    const lastCentre = rows[n - 1][0].x;
    expect(firstCentre - (-0.5)).toBeCloseTo(g + 0.006, 9);
    expect(0.5 - lastCentre).toBeCloseTo(g + 0.006, 9);
  });
});