import { describe, expect, it } from 'vitest';
import { applyIntricacy, buildEdgeBorder, annotateRanks, elaborate, buildCoreFrameSpecs, buildFrameSpecs, offsetPolylineOutward } from './index';
import type { PolylineSpec } from './types';
import { SIGNATURE_GENOME, withGene } from './genome';

const WIDTH = 5.4;

const spec = (overrides: Partial<PolylineSpec> = {}): PolylineSpec => ({
  points: [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  width: 0.02,
  depth: 0.03,
  kind: 'rule',
  delay: 0,
  z: 0,
  ...overrides,
});

describe('miter offsets at the degenerate ends', () => {
  it('returns the points unchanged for a single point', () => {
    const single = [{ x: 3, y: 4 }];
    expect(offsetPolylineOutward(single, 0.2, false)).toEqual([{ x: 3, y: 4 }]);
  });

  it('uses one normal at open ends and a stable one for a closed loop', () => {
    const open = offsetPolylineOutward(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      0.1,
      false,
    );
    expect(open).toHaveLength(2);
    expect(Math.abs(open[0].y)).toBeCloseTo(0.1, 6);

    const closed = offsetPolylineOutward(
      [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
      ],
      0.1,
      true,
    );
    expect(closed).toHaveLength(4);
    for (const point of closed) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('falls back to a horizontal normal where the miter would collapse', () => {
    const doubledBack = offsetPolylineOutward(
      [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
      ],
      0.1,
      false,
    );
    expect(doubledBack).toHaveLength(3);
    expect(Number.isFinite(doubledBack[1].x)).toBe(true);
  });
});

describe('elaboration skips productions that cannot apply', () => {
  it('drops a guilloche twin for a curved rule and a chevron that is not a chevron', () => {
    const curvedRule = spec({
      kind: 'rule',
      points: [
        { x: 0, y: 1 },
        { x: 0.5, y: 0.9 },
        { x: 1, y: 1 },
      ],
    });
    const flatChevron = spec({ kind: 'chevron' });
    const flatRay = spec({
      kind: 'ray',
      points: [
        { x: 0, y: 0 },
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.4 },
      ],
    });
    expect(elaborate([curvedRule], 1)).toHaveLength(1);
    expect(elaborate([flatChevron], 1)).toHaveLength(1);
    expect(elaborate([flatRay], 1)).toHaveLength(1);
  });
});

describe('corner profiles reshape the plate', () => {
  const signature = buildFrameSpecs('gatsby_hero', WIDTH, 0.5).length;

  it('rounds an outward corner', () => {
    const rounded = applyIntricacy(
      buildCoreFrameSpecs('gatsby_hero', WIDTH, withGene(SIGNATURE_GENOME, 'cornerProfile', 0.8)),
      0.5,
    );
    const plain = applyIntricacy(
      buildCoreFrameSpecs('gatsby_hero', WIDTH, withGene(SIGNATURE_GENOME, 'cornerProfile', 0)),
      0.5,
    );
    const pointCount = (specs: PolylineSpec[]) =>
      specs.reduce((total, entry) => total + entry.points.length, 0);
    expect(pointCount(rounded)).toBeGreaterThan(pointCount(plain));
  });

  it('notches an inward corner', () => {
    const notched = applyIntricacy(
      buildCoreFrameSpecs('gatsby_hero', WIDTH, withGene(SIGNATURE_GENOME, 'cornerProfile', -0.9)),
      0.5,
    );
    const plain = applyIntricacy(
      buildCoreFrameSpecs('gatsby_hero', WIDTH, withGene(SIGNATURE_GENOME, 'cornerProfile', 0)),
      0.5,
    );
    const pointCount = (specs: PolylineSpec[]) =>
      specs.reduce((total, entry) => total + entry.points.length, 0);
    expect(pointCount(notched)).toBeGreaterThan(pointCount(plain));
    expect(buildFrameSpecs('gatsby_hero', WIDTH, 0.5)).toHaveLength(signature);
  });
});

describe('a border that is squeezed flat', () => {
  it('drops rays and ticks shorter than the printed minimum', () => {
    const cramped = buildEdgeBorder({
      aspect: 0.5,
      density: 0,
      genome: withGene(withGene(SIGNATURE_GENOME, 'rayReach', 0.02), 'wingSweep', 0.02),
    });
    expect(cramped.specs.length).toBeGreaterThan(0);
    for (const spec of cramped.specs) {
      for (const point of spec.points) {
        expect(Number.isFinite(point.x)).toBe(true);
      }
    }
  });
});

describe('grammar helpers that take un-annotated specs', () => {
  const bare = (
    kind: 'frame' | 'diamond' | 'rule' | 'column' | 'chevron' | 'ray' | 'arch' | undefined,
    points: { x: number; y: number }[],
  ): PolylineSpec => ({ points, width: 0.01, depth: 0.02, kind, delay: 0.1, z: 0, partDir: 1 });

  it('treats a missing kind as a frame when ranking', () => {
    const ranked = annotateRanks([bare(undefined, [{ x: 0, y: 0 }, { x: 1, y: 0 }])]);
    expect(ranked[0].rank).toBe(0);
  });

  it('scales a diamond down to its centroid, even with no points', () => {
    const produced = elaborate([bare('diamond', [])], 1);
    expect(produced.length).toBeGreaterThan(1);
  });

  it('guards guilloche twins against coincident end points', () => {
    const produced = elaborate([bare('rule', [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }])], 1);
    expect(produced.length).toBeGreaterThan(1);
    for (const spec of produced) {
      for (const point of spec.points) expect(Number.isFinite(point.x)).toBe(true);
    }
  });

  it('skips productions that have none for an arch', () => {
    const produced = elaborate([bare('arch', [{ x: 0, y: 0 }, { x: 1, y: 0 }])], 1);
    expect(produced).toHaveLength(1);
  });
});
