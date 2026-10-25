import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stableDigest } from '@/test/digest';
import { createChamferedFrameGeometry } from './railGeometry';
import type { PolylineSpec } from '../engine/frameGrammar/types';

/**
 * The shared rail extrusion, pinned before it was split into its parts
 * (ADDENDUM-033). Everything asserted here is a property of the *buffer* the
 * renderer uploads — positions, normals, the `aPathData` reveal channel, the
 * index order — so a refactor that moves any of them is a behaviour change.
 *
 * Index order is asserted deliberately: three.js draws triangles in the order
 * they are pushed, and a winding flip would turn every gold facet black in the
 * browser while leaving the vertex count identical.
 */

function digestOf(specs: PolylineSpec[]) {
  const geometry = createChamferedFrameGeometry(specs);
  const attr = (name: string) =>
    Array.from((geometry.getAttribute(name) as THREE.BufferAttribute).array as Float32Array);
  const descriptor = {
    positions: attr('position'),
    normals: attr('normal'),
    pathData: attr('aPathData'),
    index: Array.from(geometry.getIndex()?.array ?? []),
    count: geometry.getAttribute('position').count,
    sphereRadius: geometry.boundingSphere?.radius ?? null,
  };
  geometry.dispose();
  return descriptor;
}

const OPEN_RULE: PolylineSpec = {
  points: [
    { x: -2, y: 0 },
    { x: 0, y: 0.4 },
    { x: 2, y: 0 },
  ],
  width: 0.08,
  depth: 0.12,
  z: 0.1,
  delay: 0.2,
  kind: 'rule',
};

const CLOSED_OCTAGON: PolylineSpec = {
  points: [
    { x: -1, y: -1 },
    { x: 0, y: -1.4 },
    { x: 1, y: -1 },
    { x: 1.4, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1.4 },
    { x: -1, y: 1 },
    { x: -1.4, y: 0 },
  ],
  width: 0.06,
  depth: 0.1,
  z: 0,
  delay: 0.1,
  kind: 'frame',
  closed: true,
};

describe('createChamferedFrameGeometry', () => {
  it('builds the same buffer for an open rule as before the split', () => {
    expect(stableDigest(digestOf([OPEN_RULE]))).toMatchInlineSnapshot(`
      {
        "hash": "5ddbbe3f97e68b3aaf25356cb3f18ec33f5df24c",
        "length": 1158,
      }
    `);
  });

  it('builds the same buffer for a closed octagon as before the split', () => {
    expect(stableDigest(digestOf([CLOSED_OCTAGON]))).toMatchInlineSnapshot(`
      {
        "hash": "2041c65c5037cb876b47401a9180c0b3682b5ba7",
        "length": 3509,
      }
    `);
  });

  it('emits six cross-section vertices per ring, and squares the strip into triangles', () => {
    const geometry = createChamferedFrameGeometry([OPEN_RULE]);
    const rings = OPEN_RULE.points.length;
    const profile = 6;
    expect(geometry.getAttribute('position').count).toBe(rings * profile);
    expect(geometry.getAttribute('normal').count).toBe(rings * profile);
    expect(geometry.getAttribute('aPathData').count).toBe(rings * profile);
    // (rings - 1) seams x (profile - 1) quads x 2 triangles x 3 indices.
    expect(geometry.getIndex()?.count).toBe((rings - 1) * (profile - 1) * 6);
    geometry.dispose();
  });

  it('wraps a closed spec into one extra ring so the first and last seam join', () => {
    const geometry = createChamferedFrameGeometry([CLOSED_OCTAGON]);
    expect(geometry.getAttribute('position').count).toBe((CLOSED_OCTAGON.points.length + 1) * 6);
    geometry.dispose();
  });

  it('writes the reveal channel as (uProgress, delay, parting side)', () => {
    const geometry = createChamferedFrameGeometry([{ ...OPEN_RULE, partDir: -1 }]);
    const path = geometry.getAttribute('aPathData');
    const read = (ring: number, vertex: number) => [
      path.getX(ring * 6 + vertex),
      path.getY(ring * 6 + vertex),
      path.getZ(ring * 6 + vertex),
    ];
    const expectRing = (ring: number, vertex: number, u: number) => {
      const [gotU, gotDelay, gotSide] = read(ring, vertex);
      expect(gotU).toBeCloseTo(u, 5);
      // The attribute is Float32, so 0.2 comes back as 0.20000000298.
      expect(gotDelay).toBeCloseTo(0.2, 5);
      // A partDir override wins over the geometric side for every vertex.
      expect(gotSide).toBe(-1);
    };
    expectRing(0, 0, 0);
    expectRing(1, 2, 0.5);
    expectRing(2, 5, 1);
    geometry.dispose();
  });

  it('derives the parting side from the vertex x when partDir is absent', () => {
    const geometry = createChamferedFrameGeometry([
      {
        points: [
          { x: -3, y: 0 },
          { x: 3, y: 0 },
        ],
        width: 0.05,
        depth: 0.08,
        z: 0,
        delay: 0,
        kind: 'rule',
      },
    ]);
    const side = (vertex: number) => geometry.getAttribute('aPathData').getZ(vertex);
    expect(side(0)).toBe(-1);
    expect(side(6)).toBe(1);
    geometry.dispose();
  });

  it('keeps a straddling vertex on the centroid side and survives a zero-length step', () => {
    // The middle vertex sits on x = 0, so the sign comes from the centroid; the
    // duplicated point makes the segment normal degenerate (the miter guard).
    const geometry = createChamferedFrameGeometry([
      {
        points: [
          { x: -2, y: 0 },
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
        width: 0.05,
        depth: 0.08,
        z: 0,
        delay: 0,
        kind: 'rule',
      },
    ]);
    const path = geometry.getAttribute('aPathData');
    const node = Array.from({ length: path.count }, (_, i) => [path.getX(i), path.getZ(i)]);
    expect(node[6][1]).toBe(1);
    expect(node[12][1]).toBe(1);
    // The duplicated point contributes 1e-4 of arc length, so the midpoint is a
    // hair past 0.5 — that tiny asymmetry is the guard working as designed.
    expect(node[12][0]).toBeCloseTo(0.5, 4);
    geometry.dispose();
  });

  it('keeps every emitted normal close to unit length', () => {
    // The cross-section normals are hand-tuned literal pairs (e.g. -0.25 / 0.968)
    // rather than renormalised, so they land within ~2.4e-4 of unit length. Kept
    // as-is on purpose: renormalising would shift the crest highlight slightly.
    const geometry = createChamferedFrameGeometry([OPEN_RULE, CLOSED_OCTAGON]);
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      expect(Math.abs(length - 1)).toBeLessThan(5e-4);
    }
    geometry.dispose();
  });

  it('skips a single-point spec but still extrudes a two-point spec of zero length', () => {
    // A segment contributes at least 1e-4 of arc length by construction, so the
    // `totalLen < 1e-4` early return is unreachable belt-and-braces: a collapsed
    // two-point line produces a degenerate (but well-formed) 12-vertex bar.
    const geometry = createChamferedFrameGeometry([
      { points: [{ x: 1, y: 1 }], width: 0.05, depth: 0.08, z: 0, delay: 0, kind: 'rule' },
      {
        points: [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        width: 0.05,
        depth: 0.08,
        z: 0,
        delay: 0,
        kind: 'rule',
      },
    ]);
    expect(geometry.getAttribute('position').count).toBe(12);
    expect(geometry.getIndex()?.count).toBe(30);
    expect(geometry.boundingSphere).not.toBeNull();
    geometry.dispose();
  });
});
