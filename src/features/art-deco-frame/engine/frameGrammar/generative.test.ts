import { describe, expect, it } from 'vitest';
import { FrameArchetype } from '../../model/types';
import { SIGNATURE_GENOME } from './genome';
import { clampGenesisLevel } from './generative';
import {
  FRAME_SOURCES,
  FrameFormula,
  FrameSource,
  PolylineSpec,
  buildFrame,
  buildFrameSpecs,
  cantorSegments,
  mirrorHalves,
} from './index';

const ARCHETYPES: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];
const WIDTH = 5.4;
const GENERATIVE = FRAME_SOURCES.filter((s) => s.isGenerative).map((s) => s.id);
const formula = (source: FrameSource, level = 2): FrameFormula => ({ source, level, genome: { ...SIGNATURE_GENOME } });

const points = (specs: PolylineSpec[]) => specs.reduce((n, s) => n + s.points.length, 0);
const geometryOf = (s: PolylineSpec) =>
  JSON.stringify([s.points, s.closed ?? false, s.width, s.depth, s.z, s.delay, s.partDir ?? 0]);

const symmetryKey = (s: PolylineSpec, sign: number) =>
  JSON.stringify(
    s.points
      .map((p) => [Math.round(p.x * sign * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  ) + `|${Math.round(s.z * 1e4)}|${Math.round(s.width * 1e4)}`;

describe('authored genesis is preserved', () => {
  for (const archetype of ARCHETYPES) {
    it(`${archetype}: authored ignores level and matches the delivered wrapper`, () => {
      const delivered = buildFrameSpecs(archetype, WIDTH).map(geometryOf);
      expect(buildFrame({ archetype, mainWidth: WIDTH, formula: formula('authored', 1) }).map(geometryOf)).toEqual(delivered);
      expect(buildFrame({ archetype, mainWidth: WIDTH, formula: formula('authored', 4) }).map(geometryOf)).toEqual(delivered);
    });
  }
  it('default formula is authored', () => {
    expect(buildFrame({ archetype: 'gatsby_hero', mainWidth: WIDTH }).map(geometryOf)).toEqual(
      buildFrame({ archetype: 'gatsby_hero', mainWidth: WIDTH, formula: formula('authored') }).map(geometryOf)
    );
  });
});

describe('generative sources', () => {
  for (const source of GENERATIVE) {
    for (const archetype of ARCHETYPES) {
      it(`${source} / ${archetype}: symmetric, deterministic, tagged`, () => {
        const specs = buildFrame({ archetype, mainWidth: WIDTH, formula: formula(source, 4), intricacy: 1 });
        expect(specs.length).toBeGreaterThan(3);
        expect(specs.every((s) => s.kind && s.rank !== undefined)).toBe(true);
        // The GG letterforms interlock asymmetrically by design; everything else mirrors.
        const rails = specs.filter((s) => s.kind !== 'monogram' && s.kind !== 'pinstripe');
        const bag = new Set(rails.map((s) => symmetryKey(s, 1)));
        for (const s of rails) expect(bag.has(symmetryKey(s, -1))).toBe(true);
        const again = buildFrame({ archetype, mainWidth: WIDTH, formula: formula(source, 4), intricacy: 1 });
        expect(again.map(geometryOf)).toEqual(specs.map(geometryOf));
      });

      it(`${source} / ${archetype}: stays within the Baroque vertex budget`, () => {
        const specs = buildFrame({ archetype, mainWidth: WIDTH, formula: formula(source, 4), intricacy: 1 });
        expect(points(specs)).toBeLessThanOrEqual(1200);
      });

      it(`${source} / ${archetype}: level count is monotone`, () => {
        const counts = [1, 2, 3, 4].map(
          (level) => buildFrame({ archetype, mainWidth: WIDTH, formula: formula(source, level) }).length
        );
        for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        expect(counts[3]).toBeGreaterThan(counts[0]);
      });
    }
  }

  it('preserves the authored GG monogram in every source', () => {
    const authoredGlyph = buildFrameSpecs('monogram_gate', WIDTH)
      .filter((s) => s.kind === 'monogram' || s.kind === 'pinstripe')
      .map(geometryOf);
    for (const source of GENERATIVE) {
      const glyph = buildFrame({
        archetype: 'monogram_gate',
        mainWidth: WIDTH,
        formula: formula(source, 3),
      })
        .filter((s) => s.kind === 'monogram' || s.kind === 'pinstripe')
        .map(geometryOf);
      expect(glyph).toEqual(authoredGlyph);
    }
  });

  it('keeps a closed primary frame at Minimal intricacy', () => {
    for (const source of GENERATIVE) {
      const specs = buildFrame({ archetype: 'sunburst_octagon', mainWidth: WIDTH, formula: formula(source), intricacy: 0 });
      expect(specs.some((s) => s.kind === 'frame' && s.rank === 0)).toBe(true);
      expect(specs.every((s) => s.rank === 0)).toBe(true);
    }
  });
});

describe('math helpers', () => {
  it('Cantor removal halves the count per level', () => {
    expect(cantorSegments(0, 1, 0)).toHaveLength(1);
    expect(cantorSegments(0, 1, 1)).toHaveLength(2);
    expect(cantorSegments(0, 1, 3)).toHaveLength(8);
    const gaps = cantorSegments(0, 1, 1);
    expect(gaps[0][1]).toBeCloseTo(1 / 3, 6);
    expect(gaps[1][0]).toBeCloseTo(2 / 3, 6);
  });

  it('mirrorHalves produces exact reflections with opposite parting', () => {
    const right = [
      { points: [{ x: 0, y: 1 }, { x: 1, y: 0 }], width: 0.1, depth: 0.1, z: 0, delay: 0, kind: 'frame' as const },
    ];
    const out = mirrorHalves(right);
    expect(out).toHaveLength(2);
    expect(out[1].points).toEqual([{ x: -0, y: 1 }, { x: -1, y: 0 }]);
    expect(out[0].partDir).toBe(1);
    expect(out[1].partDir).toBe(-1);
  });


});

describe('clampGenesisLevel', () => {
  it('falls back to level two for a non-finite level', () => {
    expect(clampGenesisLevel(Number.NaN)).toBe(2);
    expect(clampGenesisLevel(Number.POSITIVE_INFINITY)).toBe(2);
  });
});
