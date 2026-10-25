import { describe, expect, it } from 'vitest';
import type { DecoLatticeGeometry } from '@/features/deco-lattice';
import { buildEdgeBorder } from './edgeBorder';
import { elaborate, annotateRanks } from './grammar';
import { latticeToRails } from './latticeAdapter';
import type { PolylineSpec } from './types';

const GEOMETRY: DecoLatticeGeometry = {
  hw: 2,
  hh: 1,
  specs: [
    { points: [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }], closed: true, width: 0.05, layer: 0, rank: 0 },
    { points: [{ x: -1, y: 0 }, { x: 1, y: 0 }], width: 0.02, layer: 0, rank: 1 },
    { points: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0 }], width: 0.02, layer: 1, rank: 1 },
    { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 0.01, layer: 2, rank: 2 },
    { points: [{ x: 0, y: 0 }, { x: 0, y: 0.2 }], width: 0.008, layer: 3, rank: 3 },
    { points: [{ x: 0, y: 0 }, { x: 0.2, y: 0.2 }], width: 0.008, layer: 3, rank: 2 },
  ],
};

describe('latticeToRails', () => {
  it('maps tutorial layers to rail kinds, scaling coordinates and widths', () => {
    const rails = latticeToRails(GEOMETRY, { coordScale: 3, widthScale: 2 });
    expect(rails.map((r) => r.kind)).toEqual(['frame', 'rule', 'star', 'lattice', 'reed', 'diamond']);
    expect(rails[0].points[0]).toEqual({ x: -6, y: -3 });
    expect(rails[0].width).toBeCloseTo(0.1, 9);
    expect(rails[0].closed).toBe(true);
    expect(rails[1].closed).toBe(false);
    expect(rails.every((r) => r.partDir === 0 && r.depth === 0.09)).toBe(true);
    expect(rails[3].z).toBeLessThan(rails[0].z);
    expect(rails[3].delay).toBeGreaterThan(rails[0].delay);
  });

  it('clamps hairline widths to a renderable minimum', () => {
    const rails = latticeToRails(GEOMETRY, { coordScale: 1, widthScale: 0.01 });
    expect(Math.min(...rails.map((r) => r.width))).toBe(0.004);
  });
});

describe('lattice grammar kinds', () => {
  const rail = (kind: PolylineSpec['kind']): PolylineSpec => ({
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
    width: 0.05, depth: 0.09, z: 0, delay: 0, kind,
  });

  it('ranks star above lattice above reed', () => {
    const ranked = annotateRanks([rail('reed'), rail('lattice'), rail('star')]);
    expect(ranked.map((r) => r.rank)).toEqual([3, 2, 1]);
  });

  it('elaborates stars inward and lattice into strands, but reeds never', () => {
    expect(elaborate([rail('star')], 1).length).toBeGreaterThan(1);
    expect(elaborate([rail('lattice')], 1).length).toBe(2);
    expect(elaborate([rail('reed')], 1)).toHaveLength(1);
    const starEcho = elaborate([rail('star')], 1)[1];
    expect(Math.abs(starEcho.points[1].y)).toBeLessThan(1);
  });
});

describe('lattice screen border', () => {
  it('stays inside the viewport and clear of the centre for wide and portrait aspects', () => {
    for (const aspect of [16 / 9, 390 / 844, 3.2]) {
      const geo = buildEdgeBorder({ aspect, density: 0.8, pattern: 'lattice', seed: 1925 });
      const clamped = Math.min(3.2, Math.max(0.5, aspect));
      expect(geo.extentX).toBeLessThanOrEqual(clamped + 1e-6);
      expect(geo.extentY).toBeLessThanOrEqual(1 + 1e-6);
      expect(geo.specs.length).toBeGreaterThan(3);
      expect(geo.specs.some((s) => s.kind === 'frame')).toBe(true);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = buildEdgeBorder({ aspect: 1.6, density: 0.5, pattern: 'lattice', seed: 42 });
    const b = buildEdgeBorder({ aspect: 1.6, density: 0.5, pattern: 'lattice', seed: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('leaves the poster border as the default', () => {
    const fallback = buildEdgeBorder({ aspect: 1.6, density: 0.5 });
    const poster = buildEdgeBorder({ aspect: 1.6, density: 0.5, pattern: 'poster' });
    expect(JSON.stringify(fallback)).toBe(JSON.stringify(poster));
  });
});
