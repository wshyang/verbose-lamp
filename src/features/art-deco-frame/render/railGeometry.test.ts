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

/**
 * The extrusion's edge cases, on hand-derived inputs. The rail is 0.1 wide (crest half-width 0.026,
 * so vertex 3, the right crest edge, sits 0.026 from the centreline along the offset direction) and
 * 0.08 deep. Each figure below was worked out from the cross-section and checked against the
 * unsplit function's output before the function was split.
 */
describe('createChamferedFrameGeometry joins and ends', () => {
  const FLAT = { width: 0.1, depth: 0.08, z: 0, delay: 0.2 } as const;
  const CREST_RIGHT = 3;
  const RING = 6;

  function vertex(points: { x: number; y: number }[], ring: number, extra: Partial<PolylineSpec> = {}, at = CREST_RIGHT) {
    const geometry = createChamferedFrameGeometry([{ ...FLAT, points, ...extra }]);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const path = geometry.getAttribute('aPathData');
    const i = ring * RING + at;
    return {
      x: position.getX(i), y: position.getY(i), nx: normal.getX(i), ny: normal.getY(i), u: path.getX(i), side: path.getZ(i),
    };
  }

  it('offsets an end cap along the normal of its only segment', () => {
    const start = vertex([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0);
    const end = vertex([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1);

    // Travelling along +x, the left normal is +y: the crest edge is 0.026 up.
    expect([start.x, start.y]).toEqual([0, expect.closeTo(0.026, 5)]);
    expect([end.x, end.y]).toEqual([1, expect.closeTo(0.026, 5)]);
  });

  it('takes the end cap of a multi-segment rail from its last segment, not an interior one', () => {
    // Last segment runs straight up, so its normal points to -x: the end cap sits 0.026 to the left.
    const end = vertex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 2);

    expect(end.x).toBeCloseTo(1 - 0.026, 5);
    expect(end.y).toBeCloseTo(1, 5);
  });

  it('mitres a right-angle corner so both edges keep their width', () => {
    const corner = vertex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 1);

    // The miter normal bisects (0,1) and (-1,0), scaled by 1/dot = sqrt(2): offset (-1, 1) at 0.026.
    expect(corner.x).toBeCloseTo(1 - 0.026, 5);
    expect(corner.y).toBeCloseTo(0.026, 5);
  });

  it('caps the miter on a hairpin instead of letting it spike', () => {
    const hairpin = vertex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0.05 }], 1);

    // Unclamped, 1/dot would be about 20 and the vertex would shoot far outside the join.
    const reach = Math.hypot(hairpin.x - 1, hairpin.y - 0);
    expect(reach).toBeLessThanOrEqual(2.3 * 0.026 + 1e-6);
    expect(reach).toBeGreaterThan(0.05);
  });

  it('falls back to the first segment normal when a join exactly reverses', () => {
    const back = vertex([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], 1);

    // The two normals cancel (sum is zero); the join uses the incoming one, +y, with no miter.
    expect(back.x).toBe(1);
    expect(back.y).toBeCloseTo(0.026, 5);
    expect(back.ny).toBeCloseTo(0.25, 5);
  });

  it('measures progress along the rail by length and floors a zero-length segment', () => {
    const middle = vertex([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], 1);
    const last = vertex([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], 2);

    expect(last.u).toBe(1);
    // The empty segment still counts for 1e-4 of an otherwise 1.0001 long rail.
    expect(middle.u).toBeCloseTo(1e-4 / 1.0001, 6);
    expect(Number.isFinite(middle.x) && Number.isFinite(middle.y)).toBe(true);
  });

  it('closes a loop on its start point, with progress reaching exactly 1', () => {
    const square = [{ x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }];
    const first = vertex(square, 0, { closed: true });
    const closing = vertex(square, 4, { closed: true });

    expect([closing.x, closing.y]).toEqual([first.x, first.y]);
    expect(first.u).toBe(0);
    expect(closing.u).toBe(1);
  });
});

describe('createChamferedFrameGeometry gate side', () => {
  const FLAT = { width: 0.1, depth: 0.08, z: 0, delay: 0.2 } as const;
  const side = (points: { x: number; y: number }[], partDir?: number) => {
    const geometry = createChamferedFrameGeometry([{ ...FLAT, points, partDir }]);
    return geometry.getAttribute('aPathData').getZ(0);
  };
  const up = (x: number) => [{ x, y: 0 }, { x, y: 1 }];

  it('uses the rail\'s own direction when it has one', () => {
    expect(side(up(-3), 1)).toBe(1);
    expect(side(up(3), -1)).toBe(-1);
  });

  it('treats a direction of zero as unset', () => {
    expect(side(up(-3), 0)).toBe(-1);
    expect(side(up(3), 0)).toBe(1);
  });

  it('sends a point left or right of the centre band to its own side', () => {
    expect(side(up(-0.021))).toBe(-1);
    expect(side(up(0.021))).toBe(1);
  });

  // Each fixture puts the first point inside the band and the rail's mean on the OPPOSITE side, so
  // the side can only come from the mean. Rails symmetric about zero would pass whichever rule applied.
  it("keeps a point inside the 0.02 centre band on the side of the rail's mean, not its own", () => {
    expect(side([{ x: 0.015, y: 0 }, { x: -10, y: 1 }])).toBe(-1);
    expect(side([{ x: -0.015, y: 0 }, { x: 10, y: 1 }])).toBe(1);
  });

  it('treats a mean of exactly zero as the right-hand side', () => {
    expect(side([{ x: -0.01, y: 0 }, { x: 0.01, y: 1 }])).toBe(1);
  });

  it('leaves the band just outside 0.02 on either side, taking the point\'s own side', () => {
    expect(side([{ x: 0.0201, y: 0 }, { x: -10, y: 1 }])).toBe(1);
    expect(side([{ x: -0.0201, y: 0 }, { x: 10, y: 1 }])).toBe(-1);
  });

  it('keeps a point exactly on 0.02 inside the band, so it follows the mean', () => {
    expect(side([{ x: 0.02, y: 0 }, { x: -10, y: 1 }])).toBe(-1);
    expect(side([{ x: -0.02, y: 0 }, { x: 10, y: 1 }])).toBe(1);
  });

  it('puts the band edge between 0.015 and 0.025, not further in or out', () => {
    expect(side([{ x: 0.015, y: 0 }, { x: -10, y: 1 }])).toBe(-1);
    expect(side([{ x: 0.025, y: 0 }, { x: -10, y: 1 }])).toBe(1);
    expect(side([{ x: 0.0095, y: 0 }, { x: -10, y: 1 }])).toBe(-1);
  });

  it('lets a rail that crosses the centre have a side per point', () => {
    const geometry = createChamferedFrameGeometry([{ ...FLAT, points: [{ x: -2, y: 0 }, { x: 2, y: 0 }] }]);
    const path = geometry.getAttribute('aPathData');

    expect([path.getZ(0), path.getZ(6)]).toEqual([-1, 1]);
  });
});

// Sweeps the whole turn range once, because the miter divides by a dot product: a hairpin, a right
// angle, a straight line and a full reversal all pass through the same formula and none may come out
// as NaN or infinity (an invalid vertex draws as a spike across the screen).
describe('createChamferedFrameGeometry across every turn angle', () => {
  const FLAT = { width: 0.1, depth: 0.08, z: 0, delay: 0.2 } as const;

  it('stays finite from a straight line to a full reversal', () => {
    for (let i = 0; i <= 720; i++) {
      const theta = (i / 720) * Math.PI;
      const turn = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1 - Math.cos(theta), y: Math.sin(theta) }];
      const geometry = createChamferedFrameGeometry([{ ...FLAT, points: turn }]);

      for (const name of ['position', 'normal']) {
        for (const value of geometry.getAttribute(name).array) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('never lets a join reach further than the miter cap allows', () => {
    const CREST = 0.026;
    for (let i = 1; i < 720; i++) {
      const theta = (i / 720) * Math.PI;
      const turn = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1 - Math.cos(theta), y: Math.sin(theta) }];
      const position = createChamferedFrameGeometry([{ ...FLAT, points: turn }]).getAttribute('position');
      const reach = Math.hypot(position.getX(9) - 1, position.getY(9));

      expect(reach).toBeLessThanOrEqual(2.3 * CREST + 1e-6);
    }
  });

  it('reaches the full cap on a sharp hairpin and the plain half-width on a near reversal', () => {
    const reachAt = (theta: number) => {
      const turn = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1 - Math.cos(theta), y: Math.sin(theta) }];
      const position = createChamferedFrameGeometry([{ ...FLAT, points: turn }]).getAttribute('position');
      return Math.hypot(position.getX(9) - 1, position.getY(9));
    };

    expect(reachAt(0.4)).toBeCloseTo(2.3 * 0.026, 3);
    expect(reachAt(3.14)).toBeCloseTo(0.026, 3);
  });
});

