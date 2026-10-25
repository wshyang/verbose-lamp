import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_STYLE } from '../engine/frameGrammar/types';
import { buildEdgeBorder } from '../engine/frameGrammar/edgeBorder';
import { buildFrame } from '../engine/frameGrammar';
import { SIGNATURE_GENOME } from '../engine/frameGrammar/genome';
import type { FrameArchetype } from '../model/types';
import { createChamferedFrameGeometry } from './railGeometry';

const ARCHETYPES: readonly FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];

function frameGeometry(archetype: FrameArchetype, intricacy = DEFAULT_FRAME_STYLE.intricacy) {
  const specs = buildFrame({
    archetype,
    mainWidth: 5.4,
    intricacy,
    formula: { ...DEFAULT_FRAME_STYLE.formula, genome: SIGNATURE_GENOME },
  });
  return { specs, geometry: createChamferedFrameGeometry(specs) };
}

describe('createChamferedFrameGeometry', () => {
  it.each(ARCHETYPES)('builds positions, normals, trim data and indices for %s', (archetype) => {
    const { specs, geometry } = frameGeometry(archetype);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const pathData = geometry.getAttribute('aPathData');
    const index = geometry.getIndex();

    expect(specs.length).toBeGreaterThan(0);
    expect(position.count).toBeGreaterThan(0);
    expect(normal.count).toBe(position.count);
    expect(pathData.count).toBe(position.count);
    expect(index?.count).toBeGreaterThan(0);
    expect(geometry.boundingSphere).not.toBeNull();
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);

    for (let i = 0; i < pathData.count; i += 1) {
      expect(pathData.getX(i)).toBeGreaterThanOrEqual(0);
      expect(pathData.getX(i)).toBeLessThanOrEqual(1);
      expect(Math.abs(pathData.getZ(i))).toBeLessThanOrEqual(1);
    }
    geometry.dispose();
  });

  it('produces identical geometry for identical specs', () => {
    const a = frameGeometry('sunburst_octagon').geometry;
    const b = frameGeometry('sunburst_octagon').geometry;
    expect(Array.from(a.getAttribute('position').array)).toEqual(
      Array.from(b.getAttribute('position').array),
    );
    a.dispose();
    b.dispose();
  });

  it('adds rails as intricacy rises', () => {
    const baseline = frameGeometry('diamond_gateway', 0.2).geometry;
    const rich = frameGeometry('diamond_gateway', 0.95).geometry;
    expect(rich.getAttribute('position').count).toBeGreaterThan(
      baseline.getAttribute('position').count,
    );
    baseline.dispose();
    rich.dispose();
  });

  it('builds the camera-attached poster border in unit viewport space', () => {
    const { specs } = buildEdgeBorder({ aspect: 1.6, genome: SIGNATURE_GENOME, density: 0.7 });
    const geometry = createChamferedFrameGeometry(specs);
    const position = geometry.getAttribute('position');

    expect(position.count).toBeGreaterThan(0);
    for (let i = 0; i < position.count; i += 1) {
      expect(Math.abs(position.getX(i))).toBeLessThanOrEqual(1.6);
      expect(Math.abs(position.getY(i))).toBeLessThanOrEqual(1);
    }
    geometry.dispose();
  });

  it('extrudes a hand-written spec with explicit part direction', () => {
    const spec = createChamferedFrameGeometry([
      {
        kind: 'frame',
        points: [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 1 },
          { x: -1, y: 1 },
        ],
        closed: true,
        width: 0.04,
        depth: 0.02,
        z: 0,
        delay: 0,
        partDir: -1,
      },
    ]);
    const positions = spec.getAttribute('position');
    const pathData = spec.getAttribute('aPathData');
    expect(positions.count).toBeGreaterThan(0);
    expect((positions.array as Float32Array).every((value) => Number.isFinite(value))).toBe(true);
    expect(pathData.getZ(0)).toBe(-1);
    spec.dispose();
});
});

describe('degenerate rails', () => {
  const rail = (points: { x: number; y: number }[]) => ({
    points,
    width: 0.02,
    depth: 0.03,
    kind: 'rule' as const,
    delay: 0,
    z: 0,
    partDir: 1,
  });

  it('skips a spec with fewer than two points', () => {
    const geometry = createChamferedFrameGeometry([rail([{ x: 0, y: 0 }])]);
    expect(geometry.getAttribute('position').count).toBe(0);
  });

  it('still emits geometry when the two points coincide', () => {
    const geometry = createChamferedFrameGeometry([
      rail([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ]);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('falls back to the previous normal where the miter collapses', () => {
    const geometry = createChamferedFrameGeometry([
      rail([
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
      ]),
    ]);
    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    for (let i = 0; i < position.count; i += 1) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
    }
  });
});

describe('rails without a part direction', () => {
  const rail = (points: { x: number; y: number }[], closed = false) => ({
    points,
    width: 0.02,
    depth: 0.03,
    kind: 'rule' as const,
    delay: 0,
    z: 0,
    closed,
  });

  it('derives the parting side from the point position', () => {
    const geometry = createChamferedFrameGeometry([
      rail(
        [
          { x: -0.5, y: 0 },
          { x: 0, y: 0.4 },
          { x: 0.5, y: 0 },
        ],
        true,
      ),
    ]);
    const position = geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    expect((position.array as Float32Array).every((value) => Number.isFinite(value))).toBe(true);
    geometry.dispose();
  });

  it('uses the spec centre when every point sits on the seam', () => {
    const leftOfCentre = createChamferedFrameGeometry([
      rail([
        { x: -0.01, y: -0.01 },
        { x: -0.01, y: 0.01 },
      ]),
      rail([
        { x: 0.01, y: -0.01 },
        { x: 0.01, y: 0.01 },
      ]),
    ]);
    expect(leftOfCentre.getAttribute('position').count).toBeGreaterThan(0);
    leftOfCentre.dispose();
  });
});

describe('rails with a doubled mid point', () => {
  const rail = (points: { x: number; y: number }[]) => ({
    points,
    width: 0.02,
    depth: 0.03,
    kind: 'rule' as const,
    delay: 0,
    z: 0,
  });

  it('keeps geometry finite when a segment has zero length', () => {
    for (const points of [
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 0, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    ]) {
      const geometry = createChamferedFrameGeometry([rail(points)]);
      const position = geometry.getAttribute('position');
      expect(position.count).toBeGreaterThan(0);
      expect((position.array as Float32Array).every((value) => Number.isFinite(value))).toBe(true);
      geometry.dispose();
    }
  });
});
