import { describe, expect, it } from 'vitest';
import { frameBox } from './generative';
import { buildLatticeRails, latticeAperture } from './latticeSource';
import type { PolylineSpec } from './types';

const HERO_BOX = frameBox('gatsby_hero', 5.4);

function segmentCrossesAperture(spec: PolylineSpec, aperture: { hw: number; hh: number }): boolean {
  const points = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
  for (let i = 1; i < points.length; i += 1) {
    for (let s = 0; s <= 16; s += 1) {
      const t = s / 16;
      const x = points[i - 1].x + (points[i].x - points[i - 1].x) * t;
      const y = points[i - 1].y + (points[i].y - points[i - 1].y) * t;
      if (Math.abs(x) < aperture.hw - 1e-9 && Math.abs(y) < aperture.hh - 1e-9) return true;
    }
  }
  return false;
}

describe('buildLatticeRails (ADDENDUM-021 §3.5)', () => {
  it('is deterministic per seed and changes with the seed', () => {
    const a = buildLatticeRails({ box: HERO_BOX, level: 4, seed: 1925 });
    const b = buildLatticeRails({ box: HERO_BOX, level: 4, seed: 1925 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = buildLatticeRails({ box: HERO_BOX, level: 4 });
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  it('tags every rail with kind, tutorial rank, tone, delay and layered z', () => {
    const specs = buildLatticeRails({ box: HERO_BOX, level: 4, seed: 1925 });
    expect(specs.length).toBeGreaterThan(10);
    for (const spec of specs) {
      expect(spec.kind).toBeDefined();
      expect(spec.rank).toBeGreaterThanOrEqual(0);
      expect(spec.rank).toBeLessThanOrEqual(3);
      expect(spec.tone).toBeGreaterThanOrEqual(0);
      expect(spec.tone).toBeLessThanOrEqual(1);
      expect(spec.delay).toBeGreaterThanOrEqual(0);
      expect(spec.depth).toBe(0.09);
    }
    expect(specs.some((s) => s.kind === 'frame' && s.rank === 0)).toBe(true);
    expect(specs.some((s) => s.kind === 'reed' && s.rank === 3)).toBe(true);
    expect(specs.some((s) => s.kind === 'lattice-strand')).toBe(true);
    const zGap = Math.abs(specs.find((s) => s.rank === 3)!.z - specs.find((s) => s.rank === 0)!.z);
    expect(zGap).toBeGreaterThan(0.09 / 2);
  });

  it('keeps the typography aperture clear at every level', () => {
    const aperture = latticeAperture(HERO_BOX);
    for (const level of [1, 2, 3, 4]) {
      const specs = buildLatticeRails({ box: HERO_BOX, level, seed: 1925 });
      for (const spec of specs) expect(segmentCrossesAperture(spec, aperture)).toBe(false);
    }
  });

  it('level is a superset progression and clamps to 1..4', () => {
    const counts = [1, 2, 3, 4].map((level) => buildLatticeRails({ box: HERO_BOX, level, seed: 7 }).length);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[3]).toBeGreaterThan(counts[0]);
    expect(buildLatticeRails({ box: HERO_BOX, level: 0, seed: 7 })).toHaveLength(counts[0]);
    expect(buildLatticeRails({ box: HERO_BOX, level: 99, seed: 7 })).toHaveLength(counts[3]);
  });

  it('stays inside the frame box', () => {
    const specs = buildLatticeRails({ box: HERO_BOX, level: 4, seed: 1925 });
    for (const spec of specs) {
      for (const point of spec.points) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(HERO_BOX.hw + 1e-9);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(HERO_BOX.hh + 1e-9);
      }
    }
  });

  it('medallion mode emits the octagram kind', () => {
    const specs = buildLatticeRails({ box: { hw: 1, hh: 1 }, level: 2, seed: 1925, mode: 'medallion' });
    expect(specs.some((s) => s.kind === 'octagram')).toBe(true);
  });
});
