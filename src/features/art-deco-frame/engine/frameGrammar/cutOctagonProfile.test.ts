import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME, type BaseGenome } from './genome';
import { addCutOctagon } from './primitives';
import type { PolylineSpec } from './types';

/**
 * The corner-profile gene (ADDENDUM-021 §3.2): -1 notches the corner, 0 is the
 * classic 45-degree chamfer and +1 rounds it outward — without moving the plate
 * envelope, so every frame design keeps the same silhouette width.
 */
const HW = 1;
const HH = 1.2;
const CUT = 0.3;

const halvesFor = (cornerProfile: number): PolylineSpec[] => {
  const genome: BaseGenome = { ...SIGNATURE_GENOME, cornerScale: 1, cornerProfile };
  const list: PolylineSpec[] = [];

  addCutOctagon(list, HW, HH, CUT, 0.02, 0.02, 0, 0, genome);

  return list;
};

const maxAbsX = (spec: PolylineSpec) => Math.max(...spec.points.map((p) => Math.abs(p.x)));

describe('addCutOctagon corner profiles', () => {
  it('chamfers both halves straight at profile 0', () => {
    const [right, left] = halvesFor(0);

    expect(right.points).toHaveLength(6);
    expect(right.points[0]).toEqual({ x: 0, y: HH });
    expect(right.points.at(-1)).toEqual({ x: 0, y: -HH });
    expect(maxAbsX(right)).toBeCloseTo(HW, 10);
    // Signed zeros differ (-0 vs 0); the mirrored geometry is what matters.
    expect(left.points.map((p) => p.x + 0)).toEqual(right.points.map((p) => -p.x + 0));
    expect(right.partDir).toBe(1);
    expect(left.partDir).toBe(-1);
  });

  it('bulges the corner into a three-point arc when rounded', () => {
    const [right] = halvesFor(1);

    expect(right.points).toHaveLength(7);
    // The apex still touches the plate envelope: rounding never grows the frame.
    expect(maxAbsX(right)).toBeCloseTo(HW, 10);
    // The two arc points sit between the flat run and the apex.
    expect(right.points[2].x).toBeGreaterThan(right.points[1].x);
    expect(right.points[2].y).toBeLessThan(right.points[1].y);
    expect(right.points[3].x).toBeCloseTo(HW, 10);
  });

  it('notches the corner inward when concave', () => {
    const [right, straight] = [halvesFor(-1)[0], halvesFor(0)[0]];

    expect(right.points.length).toBeGreaterThan(straight.points.length);
    // The notch arrives late: it hugs the envelope but the corner itself is cut back.
    expect(maxAbsX(right)).toBeCloseTo(HW, 10);
    expect(right.points.some((p) => Math.abs(p.x - (HW - CUT * 0.35)) < 1e-9)).toBe(true);
  });

  it('ignores profiles inside the dead zone, so tiny gene nudges stay stable', () => {
    for (const tiny of [0.01, 0.02, -0.01, -0.02]) {
      expect(halvesFor(tiny)[0].points).toHaveLength(6);
    }

    expect(halvesFor(0.03)[0].points).toHaveLength(7);
    expect(halvesFor(-0.03)[0].points).toHaveLength(10);
  });
});
