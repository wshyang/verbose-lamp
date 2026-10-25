import { describe, expect, it } from 'vitest';
import type { LatticeSpec } from '@/features/deco-lattice';
import { LAYER_TONES, brassAngleFor } from '@/features/deco-lattice/model/tone';
import {
  buildLatticeSpecs,
  fitVertexBudget,
  kindForLayer,
  toPolylineSpec,
} from './latticeSource';
import type { PolylineSpec } from './types';

const BOX = { hw: 4.45, hh: 2.15 } as const;

const spec = (layer: 0 | 1 | 2 | 3, rank: 0 | 1 | 2 | 3): LatticeSpec => ({
  points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  closed: false,
  width: 0.02,
  layer,
  rank,
});

describe('kindForLayer', () => {
  it('keeps the primary frame bar at rank 0', () => {
    expect(kindForLayer(spec(0, 0))).toBe('frame');
  });

  it('maps the frame clasps to rules', () => {
    expect(kindForLayer(spec(0, 1))).toBe('rule');
  });

  it('maps the octagram family to diamonds', () => {
    expect(kindForLayer(spec(1, 1))).toBe('diamond');
  });

  it('maps strand bundles and reed rows to their own kinds', () => {
    expect(kindForLayer(spec(2, 2))).toBe('strand');
    expect(kindForLayer(spec(3, 3))).toBe('reed');
  });

  it('keeps corner motifs as diamonds', () => {
    expect(kindForLayer(spec(3, 2))).toBe('diamond');
  });
});

describe('toPolylineSpec', () => {
  it('copies the points so the source geometry never mutates', () => {
    const source = spec(0, 0);
    const converted = toPolylineSpec(source);
    expect(converted.points).toEqual(source.points);
    expect(converted.points[0]).not.toBe(source.points[0]);
  });

  it('sets a depth from the rail width', () => {
    const converted = toPolylineSpec({ ...spec(0, 0), width: 0.05 });
    expect(converted.depth).toBeCloseTo(0.085, 6);
  });

  it('never lets the depth collapse below the minimum', () => {
    expect(toPolylineSpec({ ...spec(2, 2), width: 0.001 }).depth).toBeGreaterThanOrEqual(0.012);
  });

  it('orders layers back to front and staggers their draw-on delay', () => {
    const front = toPolylineSpec(spec(3, 3));
    const back = toPolylineSpec(spec(0, 0));
    expect(front.z).toBeLessThan(back.z);
    expect(front.delay).toBeGreaterThan(back.delay);
  });

  it('leaves partDir auto so halves can be inferred from x', () => {
    expect(toPolylineSpec(spec(0, 0)).partDir).toBe(0);
  });
});

describe('brass tone on lattice rails', () => {
  it('stamps each rail with its layer tone and a seeded angle', () => {
    for (const layer of [0, 1, 2, 3] as const) {
      const converted = toPolylineSpec(spec(layer, 1), 1925);

      expect(converted.tone).toBe(LAYER_TONES[layer]);
      expect(converted.brassAngle).toBe(brassAngleFor(1925, layer));
    }
  });

  it('defaults the seed to 1925 and tilts differently for another seed', () => {
    expect(toPolylineSpec(spec(2, 2)).brassAngle).toBe(brassAngleFor(1925, 2));
    expect(toPolylineSpec(spec(2, 2), 7).brassAngle).not.toBe(toPolylineSpec(spec(2, 2), 1925).brassAngle);
  });

  it('carries the request seed into every rail of a built frame', () => {
    const angles = new Set(buildLatticeSpecs({ box: BOX, level: 4, seed: 4321 }).map((s) => s.brassAngle));

    expect(angles.size).toBeLessThanOrEqual(4);
    for (const angle of angles) {
      expect([0, 1, 2, 3].map((layer) => brassAngleFor(4321, layer))).toContain(angle);
    }
  });
});

describe('fitVertexBudget', () => {
  const rail = (rank: number): PolylineSpec => ({
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
    width: 0.01,
    depth: 0.01,
    z: 0,
    delay: 0,
    rank,
  });

  it('returns the input when it already fits', () => {
    const specs = [rail(0), rail(1)];
    expect(fitVertexBudget(specs, 100)).toEqual(specs);
  });

  it('drops whole rank tiers, highest first', () => {
    const specs = [rail(0), rail(1), rail(3), rail(3)];
    const kept = fitVertexBudget(specs, 9);
    expect(kept.map((s) => s.rank)).toEqual([0, 1]);
  });

  it('keeps rank-0 rails even when the budget is impossibly small', () => {
    expect(fitVertexBudget([rail(0), rail(0)], 1)).toHaveLength(2);
  });

  it('treats a missing rank as rank 0', () => {
    const { rank: _rank, ...unranked } = rail(0);
    expect(fitVertexBudget([unranked as PolylineSpec], 1)).toHaveLength(1);
    const kept = fitVertexBudget([unranked as PolylineSpec, rail(2)], 5);
    expect(kept).toHaveLength(1);
    expect(kept[0].rank).toBeUndefined();
  });

  it('is deterministic', () => {
    const specs = [rail(0), rail(2), rail(2)];
    expect(fitVertexBudget(specs, 6)).toEqual(fitVertexBudget(specs, 6));
  });
});

describe('buildLatticeSpecs', () => {
  it('builds a closed rank-0 frame bar for Minimal intricacy', () => {
    const specs = buildLatticeSpecs({ box: BOX, level: 1 });
    const frame = specs.find((s) => s.kind === 'frame');
    expect(frame?.closed).toBe(true);
    expect(frame?.points.length).toBeGreaterThan(3);
  });

  it('is deterministic for a seed and changes with it', () => {
    const a = buildLatticeSpecs({ box: BOX, level: 4, seed: 1925 });
    const b = buildLatticeSpecs({ box: BOX, level: 4, seed: 1925 });
    const c = buildLatticeSpecs({ box: BOX, level: 4, seed: 4321 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('adds rails as the level rises and stays inside the vertex budget', () => {
    const counts = [1, 2, 3, 4].map((level) => buildLatticeSpecs({ box: BOX, level }).length);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[3]).toBeGreaterThan(counts[0]);
    for (const level of [1, 2, 3, 4]) {
      const points = buildLatticeSpecs({ box: BOX, level }).reduce((n, s) => n + s.points.length, 0);
      expect(points).toBeLessThanOrEqual(1000);
    }
  });

  it('stays mirror-symmetric about x', () => {
    const specs = buildLatticeSpecs({ box: BOX, level: 4 });
    // Compare point sets: a shape centred on the mirror line repeats itself.
    const key = (s: PolylineSpec, sign: number) =>
      JSON.stringify(
        s.points
          .map((p) => [Math.round(p.x * sign * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      );
    const bag = new Set(specs.map((s) => key(s, 1)));
    for (const s of specs) expect(bag.has(key(s, -1))).toBe(true);
  });

  it('drops the foundation frame when used as a composable layer', () => {
    const specs = buildLatticeSpecs({ box: BOX, level: 4, includePrimaryFrame: false });
    expect(specs.some((s) => s.kind === 'frame')).toBe(false);
  });

  it('clamps an out-of-range level instead of throwing', () => {
    expect(() => buildLatticeSpecs({ box: BOX, level: 0 })).not.toThrow();
    expect(buildLatticeSpecs({ box: BOX, level: 9 })).toEqual(buildLatticeSpecs({ box: BOX, level: 4 }));
  });
});
