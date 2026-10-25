// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { FrameArchetype } from '../../model/types';
import { SIGNATURE_GENOME } from './genome';
import { FRAME_SOURCES, FrameFormula, FrameSource, PolylineSpec, buildFrame, buildFrameSpecs, buildAuthoredFrame } from './index';
import { buildGenerativeFrameSpecs } from './generative';
import { clampFormulaLevel } from './styleRules';

const ARCHETYPES_p5: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];
const WIDTH_p5 = 5.4;
const GENERATIVE_p5 = FRAME_SOURCES.filter((s) => s.isGenerative).map((s) => s.id);
const formula_p5 = (source: FrameSource, level = 2): FrameFormula => ({ source, level, genome: { ...SIGNATURE_GENOME } });
const points_p5 = (specs: PolylineSpec[]) => specs.reduce((n, s) => n + s.points.length, 0);
const geometryOf_p5 = (s: PolylineSpec) =>
  JSON.stringify([s.points, s.closed ?? false, s.width, s.depth, s.z, s.delay, s.partDir ?? 0]);
const symmetryKey_p5 = (s: PolylineSpec, sign: number) =>
  JSON.stringify(
    s.points
      .map((p) => [Math.round(p.x * sign * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  ) + `|${Math.round(s.z * 1e4)}|${Math.round(s.width * 1e4)}`;
describe('authored genesis is preserved', () => {
  for (const archetype of ARCHETYPES_p5) {
    it(`${archetype}: authored ignores level and matches the delivered wrapper`, () => {
      const delivered = buildFrameSpecs(archetype, WIDTH_p5).map(geometryOf_p5);
      expect(buildFrame({ archetype, mainWidth: WIDTH_p5, formula: formula_p5('authored', 1) }).map(geometryOf_p5)).toEqual(delivered);
      expect(buildFrame({ archetype, mainWidth: WIDTH_p5, formula: formula_p5('authored', 4) }).map(geometryOf_p5)).toEqual(delivered);
    });
  }
});
describe('generative sources', () => {
  for (const source of GENERATIVE_p5) {
    for (const archetype of ARCHETYPES_p5) {
      it(`${source} / ${archetype}: symmetric, deterministic, tagged`, () => {
        const specs = buildFrame({ archetype, mainWidth: WIDTH_p5, formula: formula_p5(source, 4), intricacy: 1 });
        expect(specs.length).toBeGreaterThan(3);
        expect(specs.every((s) => s.kind && s.rank !== undefined)).toBe(true);
        // The GG letterforms interlock asymmetrically by design; everything else mirrors.
        const rails = specs.filter((s) => s.kind !== 'monogram' && s.kind !== 'pinstripe');
        const bag = new Set(rails.map((s) => symmetryKey_p5(s, 1)));
        for (const s of rails) expect(bag.has(symmetryKey_p5(s, -1))).toBe(true);
        const again = buildFrame({ archetype, mainWidth: WIDTH_p5, formula: formula_p5(source, 4), intricacy: 1 });
        expect(again.map(geometryOf_p5)).toEqual(specs.map(geometryOf_p5));
      });

      it(`${source} / ${archetype}: stays within the Baroque vertex budget`, () => {
        const specs = buildFrame({ archetype, mainWidth: WIDTH_p5, formula: formula_p5(source, 4), intricacy: 1 });
        expect(points_p5(specs)).toBeLessThanOrEqual(1200);
      });

      it(`${source} / ${archetype}: level count is monotone`, () => {
        const counts = [1, 2, 3, 4].map(
          (level) => buildFrame({ archetype, mainWidth: WIDTH_p5, formula: formula_p5(source, level) }).length
        );
        for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        expect(counts[3]).toBeGreaterThan(counts[0]);
      });
    }
  }
});
describe('genesis level and authored wrapper defaults', () => {
  it('falls back to level 2 for non-finite levels and clamps finite levels', () => {
    expect([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(clampFormulaLevel)).toEqual([2, 2, 2]);
    expect(clampFormulaLevel(0)).toBe(1);
    expect(clampFormulaLevel(2.6)).toBe(3);
    expect(clampFormulaLevel(99)).toBe(4);
  });

  it('buildAuthoredFrame defaults to the Film Baseline intricacy', () => {
    expect(buildAuthoredFrame('gatsby_hero', WIDTH_p5, SIGNATURE_GENOME).map(geometryOf_p5)).toEqual(
      buildAuthoredFrame('gatsby_hero', WIDTH_p5, SIGNATURE_GENOME, 0.5).map(geometryOf_p5)
    );
  });

  it('can omit the primary lattice frame for layered composition', () => {
    const full = buildGenerativeFrameSpecs('gatsby_hero', WIDTH_p5, formula_p5('lattice', 2));
    const patternOnly = buildGenerativeFrameSpecs('gatsby_hero', WIDTH_p5, formula_p5('lattice', 2), {
      includePrimaryFrame: false,
    });
    expect(full.some((spec) => spec.kind === 'frame')).toBe(true);
    expect(patternOnly.every((spec) => spec.kind !== 'frame')).toBe(true);
    expect(patternOnly.length).toBeLessThan(full.length);
  });
});
