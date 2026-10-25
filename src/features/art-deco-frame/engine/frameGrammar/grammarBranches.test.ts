import { describe, expect, it } from 'vitest';
import { elaborate, offsetPolylineOutward } from './grammar';
import type { PolylineSpec } from './types';

/**
 * The grammar's less-travelled conditional paths: open polylines, degenerate
 * miters, chevrons and rays that do not match a production's shape, and the
 * kinds that deliberately never elaborate (ADDENDUM-002 §2.3).
 */
const rail = (points: PolylineSpec['points'], overrides: Partial<PolylineSpec> = {}): PolylineSpec => ({
  points,
  width: 0.02,
  depth: 0.02,
  z: 0,
  delay: 0,
  ...overrides,
});

const HIGH = 1 as const;

describe('offsetPolylineOutward', () => {
  it('copies a degenerate polyline instead of offsetting it', () => {
    const single = rail([{ x: 0.5, y: 0.5 }]);

    const offset = offsetPolylineOutward(single.points, 0.2, false);

    expect(offset).toEqual([{ x: 0.5, y: 0.5 }]);
    expect(offset[0]).not.toBe(single.points[0]);
  });

  it('treats an open run as open at both ends', () => {
    const open = offsetPolylineOutward(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      0.1,
      false
    );

    expect(open).toHaveLength(3);
    expect(open[0].y).not.toBe(0);
  });

  it('wraps a closed run, so the seam corners are mitred too', () => {
    const closed = offsetPolylineOutward(
      [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
      ],
      0.05,
      true
    );

    for (const point of closed) {
      expect(Math.abs(point.x - 0.5)).toBeGreaterThan(0.25);
      expect(Math.abs(point.y - 0.5)).toBeGreaterThan(0.25);
    }
  });
});

describe('elaborate', () => {
  it('is identity below the first generation', () => {
    const specs = [rail([{ x: 0, y: 0 }, { x: 1, y: 1 }], { kind: 'frame' })];

    expect(elaborate(specs, 0.2)).toBe(specs);
  });

  it('echoes frames and diamonds outward', () => {
    const specs = [
      rail([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }], { kind: 'frame' }),
      rail([
        { x: 0.5, y: 0.1 },
        { x: 0.9, y: 0.5 },
        { x: 0.5, y: 0.9 },
        { x: 0.1, y: 0.5 },
      ], { kind: 'diamond', closed: true }),
    ];

    const out = elaborate(specs, HIGH);

    expect(out.length).toBeGreaterThan(specs.length);
    const kinds = out.map((spec) => spec.kind);
    expect(kinds.filter((kind) => kind === 'frame').length).toBeGreaterThan(1);
    expect(kinds.filter((kind) => kind === 'diamond').length).toBeGreaterThan(1);
  });

  it('nests a three-point chevron but leaves other shapes alone', () => {
    const chevron = rail(
      [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.9 },
        { x: 0.9, y: 0.5 },
      ],
      { kind: 'chevron' }
    );
    const flat = rail([{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }], { kind: 'chevron' });

    expect(elaborate([chevron], HIGH).length).toBeGreaterThan(1);
    expect(elaborate([flat], HIGH)).toHaveLength(1);
  });

  it('extends rays into dash-dot tips and twins two-point rules', () => {
    const ray = rail([{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.6 }], { kind: 'ray' });
    const bent = rail(
      [
        { x: 0.5, y: 0.2 },
        { x: 0.6, y: 0.4 },
        { x: 0.5, y: 0.6 },
      ],
      { kind: 'ray' }
    );
    const rule = rail([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], { kind: 'rule', z: -0.2 });

    expect(elaborate([ray], HIGH)).toHaveLength(2);
    expect(elaborate([bent], HIGH)).toHaveLength(1);
    expect(elaborate([rule], HIGH).length).toBeGreaterThan(1);
  });

  it('shadows columns to one side', () => {
    const left = rail([{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.9 }], { kind: 'column', partDir: -1 });
    const right = rail([{ x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }], { kind: 'column', partDir: 1 });

    const leftOut = elaborate([left], HIGH).filter((spec) => spec !== left);
    const rightOut = elaborate([right], HIGH).filter((spec) => spec !== right);

    expect(leftOut.length).toBeGreaterThan(0);
    expect(leftOut[0].points[0].x).toBeLessThan(left.points[0].x);
    expect(rightOut[0].points[0].x).toBeGreaterThan(right.points[0].x);
  });

  it('never elaborates a kind with no production', () => {
    for (const kind of ['monogram', 'pinstripe', 'reed', 'strand', 'arch'] as const) {
      const spec = rail([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], { kind });

      expect(elaborate([spec], HIGH)).toHaveLength(1);
    }
  });

  it('caps the generations per kind, so a flourish cannot run away', () => {
    // Frames allow four echo generations even at full intricacy.
    const frame = rail([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }], { kind: 'frame' });

    expect(elaborate([frame], HIGH)).toHaveLength(1 + 4);
    expect(elaborate([frame], 0.5).length).toBeLessThan(elaborate([frame], HIGH).length);
  });
});
