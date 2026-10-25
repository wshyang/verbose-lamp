import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME } from './genome';
import { addDiamond, addSunburstFan } from './primitives';
import type { PolylineSpec } from './types';

describe('addDiamond', () => {
  it('defaults the part direction from the side of the card', () => {
    const list: PolylineSpec[] = [];
    addDiamond(list, -1.2, 0, 0.4, 0.6, 0.01, 0.02, 0, 0.1);
    addDiamond(list, 1.2, 0, 0.4, 0.6, 0.01, 0.02, 0, 0.1);
    addDiamond(list, 0, 0, 0.4, 0.6, 0.01, 0.02, 0, 0.1);
    expect(list.map((spec) => spec.partDir)).toEqual([-1, 1, 1]);
  });

  it('keeps an explicit part direction', () => {
    const list: PolylineSpec[] = [];
    addDiamond(list, 1.2, 0, 0.4, 0.6, 0.01, 0.02, 0, 0.1, -3);
    expect(list[0].partDir).toBe(-3);
  });
});

describe('addSunburstFan', () => {
  it('puts a single ray on the fan axis', () => {
    const list: PolylineSpec[] = [];
    addSunburstFan(list, 0, 0, 0.3, 1.2, 1, Math.PI * 0.8, true, 0.02, 0.05, 0, 0, {
      ...SIGNATURE_GENOME,
      rayDensity: 0.5,
    });
    expect(list.filter((spec) => spec.kind === 'ray')).toHaveLength(1);
    const [spec] = list;
    expect(spec.points).toHaveLength(2);
    const [inner, outer] = spec.points;
    // A centred ray on an upward fan points straight up at x = 0.
    expect(inner.x).toBeCloseTo(0);
    expect(outer.x).toBeCloseTo(0);
    expect(outer.y).toBeGreaterThan(inner.y);
  });

  it('fans a full set of rays symmetrically', () => {
    const list: PolylineSpec[] = [];
    addSunburstFan(list, 0, 0, 0.3, 1.2, 11, Math.PI * 0.8, false, 0.02, 0.05, 0, 0);
    expect(list.filter((spec) => spec.kind === 'ray')).toHaveLength(11);
    for (const spec of list) {
      for (const point of spec.points) expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
