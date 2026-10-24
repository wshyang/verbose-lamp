import { describe, expect, it } from 'vitest';
import type { FrameArchetype } from '../../../types/sequence';
import {
  FRAME_PRESETS,
  SIGNATURE_PRESET,
  findActivePreset,
  formatIntricacyPercent,
  getIntricacyTier,
} from '../../../data/frameIntricacy';
import {
  MAX_FRAME_EXTENT,
  MAX_FRAME_RAILS,
  MAX_FRAME_VERTICES,
  SIGNATURE_INTRICACY,
  buildFrameGeometry,
} from '../index';
import { geometryKey, mirrorKey, renderFields } from './frameTestKit';

const ARCHETYPES: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];
const WIDTH = 5.4;
const SAMPLES = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.7, 0.85, 1];

function geometryAt(archetype: FrameArchetype, intricacy: number) {
  return buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy });
}

describe('frame intricacy engine invariants', () => {
  it('is deterministic for identical input', () => {
    const first = geometryAt('gatsby_hero', 0.72);
    const second = geometryAt('gatsby_hero', 0.72);
    expect(second).toEqual(first);
  });

  it('keeps every signature rail as the seed of richer frames', () => {
    for (const archetype of ARCHETYPES) {
      const baseline = geometryAt(archetype, SIGNATURE_INTRICACY).specs.map(renderFields);
      for (const intricacy of [0.55, 0.7, 0.85, 1]) {
        const result = geometryAt(archetype, intricacy).specs.slice(0, baseline.length);
        expect(result.map(renderFields), `${archetype} @ ${intricacy}`).toEqual(baseline);
      }
    }
  });

  it('increases or holds rail count monotonically', () => {
    for (const archetype of ARCHETYPES) {
      const counts = SAMPLES.map((intricacy) => geometryAt(archetype, intricacy).stats.railCount);
      for (let index = 1; index < counts.length; index += 1) {
        expect(counts[index], `${archetype} @ ${SAMPLES[index]}`).toBeGreaterThanOrEqual(
          counts[index - 1]
        );
      }
    }
  });

  it('is mirror-symmetric in x for all non-monogram rails', () => {
    for (const archetype of ARCHETYPES) {
      for (const intricacy of SAMPLES) {
        const specs = geometryAt(archetype, intricacy).specs.filter(
          (spec) => spec.role !== 'monogram'
        );
        const forward = specs.map(geometryKey).sort();
        const mirrored = specs.map(mirrorKey).sort();
        expect(mirrored, `${archetype} @ ${intricacy}`).toEqual(forward);
      }
    }
  });

  it('classifies the essential skeleton as primary + monogram only', () => {
    for (const archetype of ARCHETYPES) {
      const specs = geometryAt(archetype, 1).specs;
      expect(specs.filter((spec) => spec.role === 'primary'), archetype).toHaveLength(2);
    }
    const monogram = geometryAt('monogram_gate', 1).specs;
    expect(monogram.filter((spec) => spec.role === 'monogram')).toHaveLength(3);
    for (const archetype of ARCHETYPES.filter((entry) => entry !== 'monogram_gate')) {
      expect(geometryAt(archetype, 1).specs.filter((spec) => spec.role === 'monogram')).toHaveLength(
        0
      );
    }
  });

  it('clamps out-of-range intricacy to the boundary renders', () => {
    for (const archetype of ARCHETYPES) {
      expect(geometryAt(archetype, -4)).toEqual(geometryAt(archetype, 0));
      expect(geometryAt(archetype, 9)).toEqual(geometryAt(archetype, 1));
    }
  });

  it('respects the framing envelope and geometry budgets at maximum intricacy', () => {
    for (const archetype of ARCHETYPES) {
      const { specs, stats } = geometryAt(archetype, 1);
      expect(stats.extent).toBeLessThanOrEqual(MAX_FRAME_EXTENT + 1e-9);
      expect(stats.railCount).toBeLessThanOrEqual(MAX_FRAME_RAILS);
      expect(stats.vertexCount).toBeLessThanOrEqual(MAX_FRAME_VERTICES);
      expect(stats.echoes).toBeGreaterThan(0);
      expect(stats.bands).toBeGreaterThan(0);
      expect(stats.rosettes).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(spec.points.length).toBeGreaterThanOrEqual(2);
        expect(spec.width).toBeGreaterThan(0);
        expect(spec.delay).toBeGreaterThanOrEqual(0);
        expect(spec.delay).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('has valid, complete preset definitions with a true signature preset', () => {
    expect(new Set(FRAME_PRESETS.map((preset) => preset.id)).size).toBe(FRAME_PRESETS.length);
    expect(SIGNATURE_PRESET.value).toBe(SIGNATURE_INTRICACY);
    expect(findActivePreset(0.85)?.id).toBe('extravagant');
    expect(findActivePreset(0.42)).toBeUndefined();
    expect(formatIntricacyPercent(0.5)).toBe('50%');
    expect(formatIntricacyPercent(9)).toBe('100%');
    expect(getIntricacyTier(0.5)).toBe('Signature');
    expect(getIntricacyTier(1)).toBe('Maximal');
  });
});
