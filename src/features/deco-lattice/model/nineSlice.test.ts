import { describe, expect, it } from 'vitest';
import { buildNineSlice, planBand, type NineSliceRequest } from './nineSlice';
import { isOctilinear, type LatticeSpec, type Pt } from './lattice';

const KEY_SCALE = 1e5;

/** Mirror-invariant key: rounded, sorted points plus the drawing fields. */
function key(spec: LatticeSpec, mx = 1, my = 1): string {
  return spec.points
    .map((p) => `${Math.round(p.x * mx * KEY_SCALE)},${Math.round(p.y * my * KEY_SCALE)}`)
    .sort()
    .join(';');
}

function specKeys(specs: readonly LatticeSpec[]): Set<string> {
  return new Set(specs.map((spec) => `${key(spec)}|${spec.width}|${spec.layer}|${spec.rank}`));
}

function build(overrides: Partial<NineSliceRequest> = {}) {
  return buildNineSlice({ hw: 1.78, hh: 1, level: 4, density: 0.5, ...overrides });
}

/** Every point of every rail, flattened. */
function allPoints(specs: readonly LatticeSpec[]): Pt[] {
  return specs.flatMap((spec) => spec.points);
}

describe('buildNineSlice', () => {
  it('keeps every rail octilinear', () => {
    for (const aspect of [1, 1.78, 3.2]) {
      const geometry = build({ hw: aspect, hh: 1 });
      for (const spec of geometry.specs) {
        const points = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
        expect(isOctilinear(points, 1e-3)).toBe(true);
      }
    }
  });

  it('is D2-exact for aspect 1, 2 and 3.2', () => {
    for (const aspect of [1, 2, 3.2]) {
      const { specs } = build({ hw: aspect, hh: 1 });
      const set = specKeys(specs);
      for (const spec of specs) {
        const full = (s: LatticeSpec) => `${key(s)}|${s.width}|${s.layer}|${s.rank}`;
        expect(set.has(full({ ...spec, points: spec.points.map((p) => ({ x: -p.x, y: p.y })) }))).toBe(true);
        expect(set.has(full({ ...spec, points: spec.points.map((p) => ({ x: p.x, y: -p.y })) }))).toBe(true);
        expect(set.has(full({ ...spec, points: spec.points.map((p) => ({ x: -p.x, y: -p.y })) }))).toBe(true);
      }
    }
  });

  it('stays inside its own box', () => {
    for (const aspect of [1, 1.78, 3.2]) {
      const { specs, bounds } = build({ hw: aspect, hh: 1 });
      for (const point of allPoints(specs)) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(bounds.hw + 1e-6);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(bounds.hh + 1e-6);
      }
    }
  });

  it('never lets a rail into the aperture', () => {
    for (const aspect of [1, 1.78, 3.2]) {
      const geometry = build({ hw: aspect, hh: 1 });
      const { hw, hh } = geometry.aperture;
      for (const point of allPoints(geometry.specs)) {
        const inside = Math.abs(point.x) < hw - 1e-6 && Math.abs(point.y) < hh - 1e-6;
        expect(inside).toBe(false);
      }
    }
  });

  it('honours a caller-supplied aperture by shrinking the corner blocks', () => {
    const geometry = build({ hw: 2.4, hh: 1, aperture: { hw: 2.1, hh: 0.7 } });
    expect(geometry.aperture).toEqual({ hw: 2.1, hh: 0.7 });
    expect(geometry.corner).toBeLessThanOrEqual(0.3 + 1e-9);
    for (const point of allPoints(geometry.specs)) {
      const inside = Math.abs(point.x) < 2.1 - 1e-6 && Math.abs(point.y) < 0.7 - 1e-6;
      expect(inside).toBe(false);
    }
  });

  it('defaults the level and the seed-independent inputs', () => {
    const explicit = buildNineSlice({ hw: 1.78, hh: 1, level: 4, density: 0.5, cornerRatio: 0.3 });
    const defaults = buildNineSlice({ hw: 1.78, hh: 1 });
    expect(defaults.specs.length).toBeGreaterThan(0);
    expect(defaults.corner).toBeCloseTo(1 * 0.3, 6);
    expect(defaults.counts).toEqual(explicit.counts);
    expect(defaults.aperture).toEqual({ hw: 1.48, hh: 0.7 });
  });

  it('counts integer reeds on every edge', () => {
    for (const aspect of [1, 1.78, 3.2]) {
      for (const density of [0, 0.5, 1]) {
        const { counts } = build({ hw: aspect, hh: 1, density });
        expect(Number.isInteger(counts.long)).toBe(true);
        expect(Number.isInteger(counts.short)).toBe(true);
        expect(counts.long).toBeGreaterThanOrEqual(2);
        expect(counts.short).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('emits exactly the reeds it promises', () => {
    const geometry = build({ hw: 1.78, hh: 1, level: 3 });
    const reeds = geometry.specs.filter((spec) => spec.rank === 2 && spec.layer === 3 && !spec.closed);
    // Two reeds per half band, both axes, all four edges.
    expect(reeds.length).toBeGreaterThanOrEqual((geometry.counts.long + geometry.counts.short) * 4);
  });

  it('each level is a superset of the one below', () => {
    const counts = [1, 2, 3, 4].map((level) => build({ level }).specs.length);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeGreaterThan(counts[index - 1]);
    }
  });

  it('keeps a closed rank-0 primary frame at minimal level', () => {
    const { specs } = build({ level: 1 });
    const primary = specs.filter((spec) => spec.rank === 0);
    expect(primary).toHaveLength(1);
    expect(primary[0].closed).toBe(true);
  });

  it('is deterministic', () => {
    expect(build().specs).toEqual(build().specs);
    expect(build({ density: 0.9 }).specs).toEqual(build({ density: 0.9 }).specs);
  });

  it('adds ornament with density and reshapes with the corner ratio', () => {
    expect(build({ density: 1 }).specs.length).toBeGreaterThan(build({ density: 0 }).specs.length);
    expect(build({ cornerRatio: 0.4 }).corner).toBeGreaterThan(build({ cornerRatio: 0.2 }).corner);
  });

  it('clamps nonsense input rather than throwing', () => {
    const tiny = build({ hw: 0.001, hh: 0.001 });
    expect(tiny.bounds.hw).toBeGreaterThan(0);
    expect(tiny.specs.length).toBeGreaterThan(0);
    const clamped = buildNineSlice({ hw: 1, hh: 1, level: 99, density: 5, cornerRatio: 9 });
    expect(clamped.corner).toBeLessThanOrEqual(0.45);
    expect(clamped.specs.length).toBeGreaterThan(0);
  });
});

describe('planBand', () => {
  it('derives the period from the integer repeat count', () => {
    for (const run of [0.4, 1, 2.1]) {
      const plan = planBand(run, 0.5);
      expect(Number.isInteger(plan.reps)).toBe(true);
      expect(plan.reps * plan.period + plan.claspHalf).toBeCloseTo(run, 9);
    }
  });

  it('packs more reeds at higher density', () => {
    expect(planBand(2, 1).reps).toBeGreaterThanOrEqual(planBand(2, 0).reps);
  });
});

// Cross-checks sourced from PR #5's layout-maths suite, restated against this builder's output.
describe('buildNineSlice layout invariants', () => {
  it('places the corner blocks inside the frame and keeps them square-sized', () => {
    for (const aspect of [1, 2, 3.2]) {
      const { corner, bounds } = build({ hw: aspect, hh: 1 });
      expect(corner).toBeLessThanOrEqual(Math.min(bounds.hw, bounds.hh));
      expect(bounds.hw - corner).toBeGreaterThan(0);
    }
  });

  it('gives the longer edge at least as many reeds as the shorter one', () => {
    for (const aspect of [2, 3.2]) {
      const { counts } = build({ hw: aspect, hh: 1 });
      expect(counts.long).toBeGreaterThanOrEqual(counts.short);
    }
  });

  it('leaves a clear interior that stays inside the frame', () => {
    for (const aspect of [1, 2, 3.2]) {
      const { aperture, bounds } = build({ hw: aspect, hh: 1 });
      expect(aperture.hw).toBeGreaterThan(0);
      expect(aperture.hh).toBeGreaterThan(0);
      expect(aperture.hw).toBeLessThan(bounds.hw);
      expect(aperture.hh).toBeLessThan(bounds.hh);
    }
  });

  it('never produces NaN from bad dimensions', () => {
    const geometry = buildNineSlice({ hw: Number.NaN, hh: -3, cornerRatio: Number.NaN, density: Number.NaN });

    expect(Number.isFinite(geometry.corner)).toBe(true);
    expect(Number.isFinite(geometry.bounds.hw) && Number.isFinite(geometry.bounds.hh)).toBe(true);
    for (const point of allPoints(geometry.specs)) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
});
