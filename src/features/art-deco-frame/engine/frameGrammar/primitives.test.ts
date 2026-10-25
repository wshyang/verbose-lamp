import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME } from './genome';
import { addDiamond, addSunburstFan } from './primitives';
import type { PolylineSpec } from './types';

describe('addDiamond', () => {
  it('points its ornament away from the card centre when no direction is given', () => {
    const list: PolylineSpec[] = [];
    addDiamond(list, -0.5, 0, 0.2, 0.12, 0.01, 0, 0, 0);
    addDiamond(list, 0.5, 0, 0.2, 0.12, 0.01, 0, 0, 0);
    expect(list[0].partDir).toBe(-1);
    expect(list[1].partDir).toBe(1);
  });

  it('keeps an explicit direction', () => {
    const list: PolylineSpec[] = [];
    addDiamond(list, 0.5, 0, 0.2, 0.12, 0.01, 0, 0, 0, 7);
    expect(list[0].partDir).toBe(7);
  });
});

describe('addSunburstFan with a single ray', () => {
  it('puts the lone ray on the axis instead of dividing by zero rays', () => {
    const list: PolylineSpec[] = [];
    addSunburstFan(list, 0, 0, 0.1, 0.4, 0, Math.PI, true, 0.006, 0, 0, 0, SIGNATURE_GENOME);
    const rays = list.filter((spec) => spec.kind === 'ray');
    expect(rays).toHaveLength(1);
    const [start, end] = rays[0].points;
    // frac = 0.5 keeps the ray vertical: no sideways offset from the fan centre.
    expect(start.x).toBeCloseTo(0, 6);
    expect(end.x).toBeCloseTo(0, 6);
    expect(end.y).toBeGreaterThan(start.y);
  });
});
