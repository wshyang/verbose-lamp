import { describe, expect, it } from 'vitest';
import { createChamferedFrameGeometry } from './railGeometry';
import type { PolylineSpec } from '../engine/frameGrammar/types';

/**
 * Three.js runs headless in node, so the geometry builder — the part of the
 * WebGL layer that has no shader in it — is genuinely covered here rather than
 * mocked (ADDENDUM-028 §3).
 */
const rail = (overrides: Partial<PolylineSpec> = {}): PolylineSpec => ({
  points: [
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
  ],
  width: 0.02,
  depth: 0.034,
  z: 0,
  delay: 0,
  ...overrides,
});

function toneOf(specs: PolylineSpec[]) {
  const geometry = createChamferedFrameGeometry(specs);
  const attribute = geometry.getAttribute('aTone');
  const values = Array.from(attribute.array as Float32Array);
  geometry.dispose();
  return { attribute, values };
}

describe('createChamferedFrameGeometry', () => {
  it('extrudes a chamfered bar with six vertices per station', () => {
    const geometry = createChamferedFrameGeometry([rail()]);
    const positions = geometry.getAttribute('position');
    expect(positions.count).toBe(3 * 6);
    expect(geometry.getIndex()?.count).toBeGreaterThan(0);
    geometry.dispose();
  });

  it('skips degenerate rails instead of throwing', () => {
    const empty = createChamferedFrameGeometry([rail({ points: [{ x: 0, y: 0 }] })]);
    expect(empty.getAttribute('position').count).toBe(0);

    // A zero-length rail still hits the 1e-4 length floor, so it emits a sliver
    // rather than nothing; what matters is that it cannot throw or produce NaN.
    const zeroLength = createChamferedFrameGeometry([
      rail({ points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }),
    ]);
    const positions = zeroLength.getAttribute('position');
    expect(positions.count).toBeLessThanOrEqual(12);
    for (const value of Array.from(positions.array as Float32Array)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    empty.dispose();
    zeroLength.dispose();
  });

  it('closes a closed rail by repeating the first station', () => {
    const geometry = createChamferedFrameGeometry([
      rail({
        points: [
          { x: -1, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: -1 },
          { x: -1, y: -1 },
        ],
        closed: true,
      }),
    ]);
    expect(geometry.getAttribute('position').count).toBe(5 * 6);
    geometry.dispose();
  });

  it('writes the part direction it is told to, and derives one otherwise', () => {
    const derive = (x: number, partDir?: number) => {
      const geometry = createChamferedFrameGeometry([
        rail({ points: [{ x, y: 0 }, { x: x + 1, y: 0 }], partDir }),
      ]);
      const pathData = geometry.getAttribute('aPathData');
      const side = pathData.getZ(0);
      geometry.dispose();
      return side;
    };

    expect(derive(0.5, 1)).toBe(1);
    expect(derive(-0.5, -1)).toBe(-1);
    expect(derive(0.5)).toBe(1);
    expect(derive(-0.5)).toBe(-1);
  });

  it('normalises the reveal path from 0 to 1 along the rail', () => {
    const geometry = createChamferedFrameGeometry([rail()]);
    const pathData = geometry.getAttribute('aPathData');
    expect(pathData.getX(0)).toBeCloseTo(0, 6);
    expect(pathData.getX(5 * 2)).toBeCloseTo(0.5, 6);
    geometry.dispose();
  });

  it('defaults the brass tone attribute for rails that carry none', () => {
    const { attribute, values } = toneOf([rail()]);
    expect(attribute.itemSize).toBe(2);
    expect(values.every((value, index) => (index % 2 === 0 ? value === 0.5 : value === 0))).toBe(true);
  });

  it('carries the per-rail tone and gradient angle through', () => {
    const { values } = toneOf([
      rail({ tone: 1, brassAngle: 90 }),
      rail({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], tone: 0.25, brassAngle: 180 }),
    ]);
    const first = values.slice(0, 2);
    expect(first[0]).toBe(1);
    expect(first[1]).toBeCloseTo(Math.PI / 2, 6);
    const second = values.slice(36, 38);
    expect(second[0]).toBe(0.25);
    expect(second[1]).toBeCloseTo(Math.PI, 6);
  });
});
