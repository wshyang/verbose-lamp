import { describe, expect, it } from 'vitest';
import { buildEdgeBorder } from './edgeBorder';
import { buildLatticeBorder } from './latticeBorder';

describe('buildLatticeBorder (ADDENDUM-021 §3.5.3)', () => {
  it('is deterministic and stays inside the viewport extents', () => {
    const a = buildLatticeBorder({ aspect: 1.78, density: 0.5, seed: 1925 });
    const b = buildLatticeBorder({ aspect: 1.78, density: 0.5, seed: 1925 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(5);
    for (const spec of a) {
      for (const point of spec.points) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(1.78 + 1e-9);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(spec.width).toBeLessThan(0.02);
      expect(spec.depth).toBeGreaterThanOrEqual(0.012);
    }
  });

  it('keeps the nine-slice centre clear of rail points', () => {
    const specs = buildLatticeBorder({ aspect: 3.2, density: 1 });
    for (const spec of specs) {
      const pointsInside = spec.points.filter((p) => Math.abs(p.x) < 2.0 && Math.abs(p.y) < 0.4);
      expect(pointsInside).toEqual([]);
    }
  });

  it('grows with density', () => {
    const light = buildLatticeBorder({ aspect: 1.5, density: 0 }).length;
    const heavy = buildLatticeBorder({ aspect: 1.5, density: 1 }).length;
    expect(heavy).toBeGreaterThan(light);
  });

  it('is reachable through buildEdgeBorder with pattern lattice', () => {
    const viaBorder = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice' });
    const direct = buildLatticeBorder({ aspect: 1.78, density: 0.5 });
    expect(viaBorder.specs.map((s) => s.points)).toEqual(direct.map((s) => s.points));
    expect(viaBorder.extentX).toBeLessThanOrEqual(1.78 + 1e-9);
    expect(viaBorder.extentY).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('the poster pattern is the unchanged default', () => {
    const plain = buildEdgeBorder({ aspect: 1.78, density: 0.5 });
    const poster = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'poster' });
    expect(JSON.stringify(plain)).toBe(JSON.stringify(poster));
  });
});
