import { describe, expect, it } from 'vitest';
import { FrameArchetype } from '../../model/types';
import {
  INTRICACY_PRESETS,
  PolylineSpec,
  buildCoreFrameSpecs,
  annotateRanks,
  buildFrameSpecs,
  elaborate,
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

describe('grammar defaults and malformed rails', () => {
  const spec = (overrides: Partial<PolylineSpec> = {}): PolylineSpec => ({
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
    ],
    width: 0.03,
    depth: 0.08,
    z: 0,
    delay: 0.1,
    ...overrides,
  });

  it('treats an untagged rail as a frame half when deriving ranks', () => {
    const untagged = [spec(), spec(), spec()];
    expect(annotateRanks(untagged).map((entry) => entry.rank)).toEqual([0, 0, 1]);
    expect(untagged.every((entry) => entry.rank === undefined)).toBe(true);
  });

  it('keeps unranked rails at the lowest budget', () => {
    const unranked = spec();
    const ranked = spec({ rank: 3 });
    expect(reduceByRank([unranked, ranked], 0)).toEqual([unranked]);
  });

  it('rejects chevron and ray productions with the wrong vertex count', () => {
    const chevron = spec({ kind: 'chevron', points: [{ x: 0, y: 1 }, { x: 1, y: 1 }] });
    const ray = spec({ kind: 'ray' });
    expect(elaborate([chevron], 1)).toEqual([chevron]);
    expect(elaborate([ray], 1)).toEqual([ray]);
  });

  it('defaults a missing kind to the frame echo and missing parting to the right', () => {
    expect(elaborate([spec()], 1).length).toBeGreaterThan(1);

    const column = spec({
      kind: 'column',
      points: [
        { x: 1, y: 1 },
        { x: 1, y: -1 },
      ],
    });
    const columns = elaborate([column], 1);
    expect(columns.length).toBeGreaterThan(1);
    expect(columns[1].points[0].x).toBeGreaterThan(column.points[0].x);
  });

  it('elaborates a diamond with no vertices without inventing geometry', () => {
    const empty = spec({ kind: 'diamond', points: [] });
    const out = elaborate([empty], 1);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((entry) => entry.points.length === 0)).toBe(true);
  });
});

describe('offsetPolylineOutward edge cases', () => {
  it('copies a lone point instead of offsetting it', () => {
    const only = [{ x: 2, y: 3 }];
    const out = offsetPolylineOutward(only, 0.1, false);
    expect(out).toEqual(only);
    expect(out[0]).not.toBe(only[0]);
  });

  it('stays finite through duplicate vertices and a reversing vertex', () => {
    const duplicate = offsetPolylineOutward(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      0.1,
      false
    );
    expect(duplicate.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);

    const reversing = offsetPolylineOutward(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ],
      0.1,
      false
    );
    expect(reversing[1].y).toBeGreaterThan(0);
  });
});
