import { describe, expect, it } from 'vitest';
import { buildCurveLut } from './curve';
import { buildGoldRampLut } from './goldRamp';
import type { CurvePoint, GoldRampStop } from './types';

/**
 * The defensive branches both LUT builders carry: unsorted input, duplicates,
 * out-of-range anchors, missing endpoints and unparseable colours. Each one has
 * to stay monotonic in x and produce a full 256-entry table (ADDENDUM-016).
 */
const asTriples = (lut: Uint8Array) =>
  Array.from({ length: lut.length / 3 }, (_, index) => Array.from(lut.slice(index * 3, index * 3 + 3)));

describe('buildCurveLut sanitising', () => {
  it('sorts anchors and resolves duplicate x by keeping the last one', () => {
    const points: CurvePoint[] = [
      { x: 1, y: 1 },
      { x: 0.5, y: 0.9 },
      { x: 0.5, y: 0.1 },
      { x: 0, y: 0 },
    ];

    const lut = buildCurveLut(points);

    expect(lut).toHaveLength(256);
    // The duplicate at 0.5 resolves to the later entry (0.1), so the curve is
    // still rising steeply after the midpoint.
    expect(lut[128]).toBe(Math.round(0.1 * 255));
    expect(lut[128]).toBeGreaterThan(lut[64]);
  });

  it('adds the missing identity endpoints', () => {
    const inner = buildCurveLut([{ x: 0.5, y: 0.8 }]);

    expect(inner[0]).toBe(0);
    expect(inner[255]).toBe(255);
    expect(inner[128]).toBe(204);
  });

  it('clamps out-of-range anchors into the unit square', () => {
    const clamped = buildCurveLut([
      { x: -2, y: -1 },
      { x: 3, y: 4 },
    ]);

    expect(clamped[0]).toBe(0);
    expect(clamped[255]).toBe(255);
  });

  it('drops non-finite anchors and falls back to identity', () => {
    const withJunk = buildCurveLut([
      { x: Number.NaN, y: 0.5 },
      { x: 0.5, y: Number.POSITIVE_INFINITY },
    ]);
    const empty = buildCurveLut([]);

    expect(withJunk).toEqual(empty);
    expect(Array.from(empty)).toEqual(Array.from({ length: 256 }, (_, index) => index));
  });

  it('flattens an endpoint rather than overshooting a sign change', () => {
    // A steep first secant followed by a negative one: the endpoint slope is
    // pinned to zero, so the curve leaves the origin flat.
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.2, y: 0.9 },
      { x: 1, y: 1 },
    ]);

    expect(lut[0]).toBe(0);
    expect(lut[1]).toBeLessThanOrEqual(lut[2]);
    expect(lut[2]).toBeLessThan(20);
  });

  it('still rises monotonically for a monotonic curve', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.3, y: 0.2 },
      { x: 0.6, y: 0.55 },
      { x: 1, y: 1 },
    ]);

    for (let index = 1; index < lut.length; index += 1) {
      expect(lut[index]).toBeGreaterThanOrEqual(lut[index - 1] - 1);
    }
  });
});

describe('buildGoldRampLut sanitising', () => {
  it('normalises unsorted stops and keeps the later duplicate', () => {
    const stops: GoldRampStop[] = [
      { position: 1, color: '#ffffff' },
      { position: 0, color: '#000000' },
      { position: 0.5, color: '#ff0000' },
      { position: 0.5, color: '#00ff00' },
    ];

    const lut = asTriples(buildGoldRampLut(stops));

    expect(lut[0]).toEqual([0, 0, 0]);
    expect(lut[128]).toEqual([0, 255, 0]);
    expect(lut[255]).toEqual([255, 255, 255]);
  });

  it('extends a ramp that starts late or ends early', () => {
    const lut = asTriples(buildGoldRampLut([{ position: 0.5, color: '#336699' }]));

    expect(lut[0]).toEqual([51, 102, 153]);
    expect(lut[255]).toEqual([51, 102, 153]);
  });

  it('falls back to the house ramp when every stop is unusable', () => {
    const empty = buildGoldRampLut([]);
    const notFinite = buildGoldRampLut([{ position: Number.NaN, color: '#ffffff' }]);

    expect(Array.from(empty)).toEqual(Array.from(notFinite));
    expect(empty).toHaveLength(256 * 3);
  });

  it('substitutes the deep-brown default for an unparseable colour', () => {
    const lut = asTriples(buildGoldRampLut([{ position: 0, color: 'not-a-colour' }]));

    expect(lut[0]).toEqual([42, 26, 6]);
  });

  it('accepts hex with and without the leading hash', () => {
    const withHash = buildGoldRampLut([{ position: 0, color: '#123456' }]);
    const withoutHash = buildGoldRampLut([{ position: 0, color: '123456' }]);

    expect(Array.from(withHash)).toEqual(Array.from(withoutHash));
  });

  it('clamps positions outside the unit interval', () => {
    const lut = asTriples(
      buildGoldRampLut([
        { position: -4, color: '#000000' },
        { position: 9, color: '#ffffff' },
      ])
    );

    expect(lut[0]).toEqual([0, 0, 0]);
    expect(lut[255]).toEqual([255, 255, 255]);
  });
});
