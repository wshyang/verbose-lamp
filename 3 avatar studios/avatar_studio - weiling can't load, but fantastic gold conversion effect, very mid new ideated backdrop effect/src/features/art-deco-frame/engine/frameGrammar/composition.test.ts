import { describe, expect, it } from 'vitest';
import { FrameArchetype } from '../../model/types';
import { SIGNATURE_GENOME } from './genome';
import { buildFrame, buildFrameSpecs, FrameFormula, FrameSource, PolylineSpec } from './index';

const WIDTH = 5.4;
const geometryOf = (spec: PolylineSpec) =>
  JSON.stringify([spec.points, spec.closed ?? false, spec.width, spec.depth, spec.z, spec.delay, spec.partDir ?? 0]);

const formula = (source: FrameSource, layers: FrameFormula['layers'] = []): FrameFormula => ({
  source,
  level: 2,
  genome: { ...SIGNATURE_GENOME },
  layers,
});

describe('composable frame patterns', () => {
  it('keeps the authored base identical when no overlay is selected', () => {
    const baseline = buildFrameSpecs('gatsby_hero', WIDTH);
    const composed = buildFrame({ archetype: 'gatsby_hero', mainWidth: WIDTH, formula: formula('authored') });
    expect(composed.map(geometryOf)).toEqual(baseline.map(geometryOf));
  });

  it('mixes pattern layers without adding duplicate primary rails', () => {
    const options = { archetype: 'gatsby_hero' as FrameArchetype, mainWidth: WIDTH };
    const base = buildFrame({ ...options, formula: formula('authored') });
    const composed = buildFrame({
      ...options,
      formula: formula('authored', [
        { source: 'fractal', enabled: true, level: 2 },
        { source: 'rosette', enabled: true, level: 3 },
        { source: 'arcade', enabled: false, level: 4 },
      ]),
    });
    const primaryCount = (specs: PolylineSpec[]) => specs.filter((spec) => spec.kind === 'frame' && spec.rank === 0).length;

    expect(composed.length).toBeGreaterThan(base.length);
    expect(primaryCount(composed)).toBe(primaryCount(base));
    expect(composed.map(geometryOf)).toEqual(
      buildFrame({ ...options, formula: formula('authored', [
        { source: 'fractal', enabled: true, level: 2 },
        { source: 'rosette', enabled: true, level: 3 },
        { source: 'arcade', enabled: false, level: 4 },
      ]) }).map(geometryOf)
    );
  });

  it('does not draw the base pattern twice when it is also listed as a layer', () => {
    const options = { archetype: 'sunburst_octagon' as const, mainWidth: WIDTH };
    const base = buildFrame({ ...options, formula: formula('fractal') });
    const duplicate = buildFrame({
      ...options,
      formula: formula('fractal', [{ source: 'fractal', enabled: true, level: 4 }]),
    });
    expect(duplicate.map(geometryOf)).toEqual(base.map(geometryOf));
  });

  it('keeps all three overlays bounded and preserves the authored monogram once', () => {
    const options = { archetype: 'monogram_gate' as const, mainWidth: WIDTH };
    const layers = [
      { source: 'fractal' as const, enabled: true, level: 4 },
      { source: 'rosette' as const, enabled: true, level: 4 },
      { source: 'arcade' as const, enabled: true, level: 4 },
    ];
    const baseGlyph = buildFrameSpecs('monogram_gate', WIDTH, 1)
      .filter((spec) => spec.kind === 'monogram' || spec.kind === 'pinstripe')
      .map(geometryOf);
    const composed = buildFrame({ ...options, intricacy: 1, formula: formula('authored', layers) });
    const composedGlyph = composed
      .filter((spec) => spec.kind === 'monogram' || spec.kind === 'pinstripe')
      .map(geometryOf);
    const pointCount = composed.reduce((total, spec) => total + spec.points.length, 0);

    expect(composedGlyph).toEqual(baseGlyph);
    expect(pointCount).toBeLessThanOrEqual(5000);
  });
});