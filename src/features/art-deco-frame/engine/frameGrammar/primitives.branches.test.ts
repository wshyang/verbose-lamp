import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME } from './genome';
import { addCutOctagon, addDiamond, addSunburstFan } from './primitives';
import type { PolylineSpec } from './types';

describe('primitive corner profiles', () => {
  it('rounds the octagon corner for a positive profile', () => {
    const list: PolylineSpec[] = [];
    addCutOctagon(list, 2, 1, 0.3, 0.1, 0.1, 0, 0, { ...SIGNATURE_GENOME, cornerProfile: 1 });
    expect(list).toHaveLength(2);
    expect(list[0].points).toHaveLength(7);
    expect(list[0].points[3]).toEqual({ x: 2, y: 1 - 0.3 });
  });

  it('notches the octagon corner for a negative profile', () => {
    const list: PolylineSpec[] = [];
    addCutOctagon(list, 2, 1, 0.3, 0.1, 0.1, 0, 0, { ...SIGNATURE_GENOME, cornerProfile: -1 });
    expect(list).toHaveLength(2);
    expect(list[0].points).toHaveLength(10);
  });
});

describe('diamond parting direction defaults', () => {
  it('derives partDir from the centre when not supplied', () => {
    const list: PolylineSpec[] = [];
    addDiamond(list, -2, 0, 0.5, 0.5, 0.1, 0.1, 0, 0);
    addDiamond(list, 2, 0, 0.5, 0.5, 0.1, 0.1, 0, 0);
    addDiamond(list, 0, 0, 0.5, 0.5, 0.1, 0.1, 0, 0);
    expect(list.map((s) => s.partDir)).toEqual([-1, 1, 1]);
  });
});

describe('sunburst single-ray fan', () => {
  it('centres the only ray when the ray count collapses to one', () => {
    const list: PolylineSpec[] = [];
    addSunburstFan(list, 0, 0, 0.2, 1, 1, Math.PI / 2, true, 0.1, 0.1, 0, 0);
    const rays = list.filter((s) => s.kind === 'ray');
    expect(rays).toHaveLength(1);
    expect(rays[0].points[1].x).toBeCloseTo(0, 9);
    expect(rays[0].points[1].y).toBeGreaterThan(0);
  });
});
