import { describe, expect, it } from 'vitest';
import { FrameArchetype } from '../../model/types';
import {
  INTRICACY_PRESETS,
  PolylineSpec,
  buildCoreFrameSpecs,
  applyIntricacy,
  buildFrameSpecs,
  elaborate,
  annotateRanks,
  elaborationGenerations,
  offsetPolylineOutward,
  rankBudget,
  reduceByRank,
} from './index';

const ARCHETYPES: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];
const WIDTH = 5.4;
const K_STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

const geometryOf = (s: PolylineSpec) =>
  JSON.stringify([s.points, s.closed ?? false, s.width, s.depth, s.z, s.delay, s.partDir ?? 0]);

describe('density functions', () => {
  it('are identities at the Film Baseline', () => {
    expect(elaborationGenerations(0.5)).toBe(0);
    expect(rankBudget(0.5)).toBe(3);
  });
  it('step as specified in ADDENDUM-002 §2.1', () => {
    expect([0.625, 0.75, 0.875, 1].map(elaborationGenerations)).toEqual([1, 2, 3, 4]);
    expect([0, 0.125, 0.25, 0.375].map(rankBudget)).toEqual([0, 1, 2, 3]);
  });
});

describe('applyIntricacy', () => {
  for (const archetype of ARCHETYPES) {
    it(`${archetype}: k = 0.5 reproduces the core geometry exactly`, () => {
      const core = buildCoreFrameSpecs(archetype, WIDTH).map(geometryOf);
      const baseline = buildFrameSpecs(archetype, WIDTH, 0.5).map(geometryOf);
      expect(baseline).toEqual(core);
    });

    it(`${archetype}: spec count is monotone non-decreasing in k`, () => {
      const counts = K_STEPS.map((k) => buildFrameSpecs(archetype, WIDTH, k).length);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
      }
      expect(counts[0]).toBeLessThan(counts[4]);
      expect(counts[4]).toBeLessThan(counts[8]);
    });

    it(`${archetype}: every kind is tagged and every rank derived`, () => {
      for (const s of buildFrameSpecs(archetype, WIDTH, 1)) {
        expect(s.kind).toBeDefined();
        expect(s.rank).toBeGreaterThanOrEqual(0);
        expect(s.rank).toBeLessThanOrEqual(3);
      }
    });

    it(`${archetype}: Baroque is mirror-symmetric for all non-letterform rails`, () => {
      const specs = buildFrameSpecs(archetype, WIDTH, 1).filter(
        (s) => s.kind !== 'monogram' && s.kind !== 'pinstripe'
      );
      // Order-insensitive: a centred diamond mirrored in x is the same point set in a
      // different winding order, which is still symmetric geometry.
      const key = (s: PolylineSpec, sign: number) =>
        JSON.stringify(
          s.points
            .map((p) => [Math.round(p.x * sign * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        ) + `|${Math.round(s.z * 1e4)}|${Math.round(s.width * 1e4)}`;
      const bag = new Set(specs.map((s) => key(s, 1)));
      for (const s of specs) expect(bag.has(key(s, -1))).toBe(true);
    });

    it(`${archetype}: Baroque stays within the absolute vertex budget`, () => {
      // 6 profile vertices per polyline point; 1,200 points ≈ 7.2k verts, one draw call.
      // Measured at introduction: hero 938, others ≤ 488 (ADDENDUM-003).
      const points = buildFrameSpecs(archetype, WIDTH, 1).reduce((n, s) => n + s.points.length, 0);
      expect(points).toBeLessThanOrEqual(1200);
    });

    it(`${archetype}: is deterministic`, () => {
      const a = buildFrameSpecs(archetype, WIDTH, 0.8).map(geometryOf);
      const b = buildFrameSpecs(archetype, WIDTH, 0.8).map(geometryOf);
      expect(a).toEqual(b);
    });
  }

  it('Minimal keeps only rank-0 rails (primary frame pair, monogram)', () => {
    const minimal = buildFrameSpecs('monogram_gate', WIDTH, 0);
    expect(minimal.every((s) => s.rank === 0)).toBe(true);
    expect(minimal.filter((s) => s.kind === 'monogram')).toHaveLength(2);
    // Both halves of the primary frame survive, so Minimal is still a closed gate.
    expect(minimal.filter((s) => s.kind === 'frame')).toHaveLength(2);
  });

  it('presets are ordered and include the baseline', () => {
    const values = INTRICACY_PRESETS.map((p) => p.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values).toContain(0.5);
  });
});

describe('elaboration productions', () => {
  const spec = (kind: string, points: Array<{ x: number; y: number }>) =>
    ({ kind, points, width: 1, delay: 0, seed: 1 }) as never;

  it('adds every generation it can for each rail kind', () => {
    const three = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(elaborate([spec('frame', three)], 1).length).toBeGreaterThan(1);
    expect(elaborate([spec('diamond', three)], 1).length).toBeGreaterThan(1);
    expect(elaborate([spec('column', three)], 1).length).toBeGreaterThan(1);
    expect(elaborate([spec('chevron', three)], 1).length).toBeGreaterThan(1);
  });

  it('declines to produce a rail from the wrong number of points', () => {
    const three = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(elaborate([spec('rule', three)], 1)).toHaveLength(1);
    expect(elaborate([spec('ray', three)], 1)).toHaveLength(1);
    expect(elaborate([spec('chevron', two)], 1)).toHaveLength(1);
    expect(elaborate([spec('rule', two)], 1).length).toBeGreaterThan(1);
    expect(elaborate([spec('ray', two)], 1).length).toBeGreaterThan(1);
  });

  it('keeps the core rails untouched at the baseline', () => {
    const core = [spec('frame', [{ x: 0, y: 0 }, { x: 1, y: 0 }])];
    expect(applyIntricacy(core, 0.5)).toHaveLength(core.length);
  });
});

describe('offsetPolylineOutward edge cases', () => {
  it('copies a degenerate polyline instead of inventing a normal', () => {
    expect(offsetPolylineOutward([], 0.1, false)).toEqual([]);
    const single = [{ x: 0.5, y: 0.5 }];
    const out = offsetPolylineOutward(single, 0.1, false);
    expect(out).toEqual(single);
    expect(out[0]).not.toBe(single[0]);
  });

  it('takes the end normals when a point has only one neighbour', () => {
    const open = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const out = offsetPolylineOutward(open, 0.1, false);
    expect(out).toHaveLength(3);
    expect(out[1].y).toBeCloseTo(-0.1, 6);
  });

  it('wraps around when the polyline is closed', () => {
    const square = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ];
    const out = offsetPolylineOutward(square, 0.2, true);
    for (const point of out) expect(Math.max(Math.abs(point.x), Math.abs(point.y))).toBeGreaterThan(1);
  });

  it('falls back to a straight normal at a hairpin turn instead of exploding', () => {
    const hairpin = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0.0000001 },
    ];
    const out = offsetPolylineOutward(hairpin, 0.1, false);
    // The two normals cancel, so the fallback keeps the first segment's normal.
    expect(out[1].x).toBeCloseTo(1, 6);
    expect(out[1].y).toBeCloseTo(0.1, 6);
  });
});

describe('offsetPolylineOutward', () => {
  it('moves a right half-frame away from the origin and keeps the x = 0 seam', () => {
    const half = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: 0, y: -1 },
    ];
    const out = offsetPolylineOutward(half, 0.1, false);
    expect(out[0].x).toBeCloseTo(0, 6);
    expect(out[0].y).toBeGreaterThan(1);
    expect(out[1].x).toBeGreaterThan(1);
    expect(out[3].x).toBeCloseTo(0, 6);
    expect(out[3].y).toBeLessThan(-1);
  });
});

describe('unannotated specs', () => {
  it('treats a spec with no kind as a frame and one with no rank as rank 0', () => {
    const bare = { points: [], width: 0.01, depth: 0, z: 0, delay: 0 } as unknown as PolylineSpec;
    expect(annotateRanks([bare])[0].rank).toBe(0);
    expect(reduceByRank([bare], 0)).toEqual([bare]);
  });

  it('counts frame halves in pairs so only the first pair is primary', () => {
    const frame = (offset: number) =>
      ({ points: [{ x: offset, y: 0 }], width: 0.01, depth: 0, z: 0, delay: 0, kind: 'frame' }) as PolylineSpec;
    expect(annotateRanks([frame(0), frame(1), frame(2), frame(3)]).map((spec) => spec.rank)).toEqual([0, 0, 1, 1]);
  });

  it('elaborates a spec with no points without dividing by zero', () => {
    const bare = { points: [], width: 0.01, depth: 0, z: 0, delay: 0, kind: 'diamond' } as unknown as PolylineSpec;
    const out = elaborate([bare], 1);
    expect(out.length).toBeGreaterThan(1);
    for (const spec of out) for (const point of spec.points) expect(Number.isFinite(point.x)).toBe(true);
  });

  it('falls back to a frame production for a spec with no kind', () => {
    const rules = {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 0 },
      ],
      width: 0.01,
      depth: 0,
      z: 0,
      delay: 0,
    } as unknown as PolylineSpec;
    expect(elaborate([rules], 1).length).toBeGreaterThan(1);
  });

  it('survives a repeated point when offsetting', () => {
    const out = offsetPolylineOutward([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], 0.1, false);
    expect(out).toHaveLength(3);
    for (const point of out) expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  });
});
