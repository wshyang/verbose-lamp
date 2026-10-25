import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME_STYLE,
  FRAME_LAYER_SOURCES,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { DESIGN_GALLERY } from '../data/frameDesigns';
import {
  FRAME_LEVEL_MAX,
  FRAME_LEVEL_MIN,
  activePresetOf,
  clampLayerLevel,
  defaultBorderStyle,
  defaultFrameFormula,
  designEntryOf,
  designLabelOf,
  detailPercent,
  detailValue,
  initialDraft,
  layerOptionsOf,
  sequenceStyleOf,
  withBorderGene,
  withBorderWeight,
  withDesign,
  withDetail,
  withGene,
  withLayer,
  withLevel,
  withPattern,
} from './frameDraft';

/**
 * The studio's transitions, exercised directly (ADDENDUM-037). The hook tests
 * prove the panel works; these prove the rules — which layer survives a pattern
 * switch, what a genome edit does to the design badge, where the clamps bite.
 */

describe('frameDraft', () => {
  it('starts from the delivered frame with signature proportions', () => {
    const draft = initialDraft();
    expect(draft.formula).toEqual(defaultFrameFormula());
    expect(draft.formula.genome).toEqual(SIGNATURE_GENOME);
    expect(draft.intricacy).toBe(DEFAULT_FRAME_STYLE.intricacy);
    expect(draft.formula.layers).not.toBe(defaultFrameFormula().layers);
  });

  it('hands the renderer one style object per commit', () => {
    const draft = { ...initialDraft(), intricacy: 0.25 };
    expect(sequenceStyleOf(draft)).toEqual({ intricacy: 0.25, formula: draft.formula });
  });

  it('drops the matching overlay when its source becomes the foundation', () => {
    const withOverlay = withLayer(initialDraft(), 'fractal', { enabled: true, level: 3 });
    expect(withOverlay.formula.layers?.find((layer) => layer.source === 'fractal')?.enabled).toBe(true);

    const switched = withPattern(withOverlay, 'fractal');
    expect(switched.formula.source).toBe('fractal');
    expect(switched.formula.layers?.find((layer) => layer.source === 'fractal')?.enabled).toBe(false);
    // The other layers are untouched.
    expect(switched.formula.layers?.find((layer) => layer.source === 'rosette')?.enabled).toBe(false);
  });

  it('resets the level when the authored frame comes back, and keeps it otherwise', () => {
    const generative = withLevel(withPattern(initialDraft(), 'arcade'), 4);
    expect(generative.formula.level).toBe(4);
    // Switching between two generative patterns keeps the level...
    expect(withPattern(generative, 'rosette').formula.level).toBe(4);
    // ...but returning to the authored frame restores its own.
    expect(withPattern(generative, 'authored').formula.level).toBe(DEFAULT_FRAME_STYLE.formula.level);
  });

  it('applies a gallery design genome, clamped', () => {
    const designed = withDesign(initialDraft(), 3);
    expect(designed.formula.genome).toEqual(DESIGN_GALLERY[3].genome);
    // The gallery entry is the badge; hand-editing a gene drops it.
    expect(designEntryOf(designed.formula)?.index).toBe(3);
    const tuned = withGene(designed, 'rayDensity', designed.formula.genome.rayDensity + 0.5);
    expect(tuned.formula.genome.rayDensity).toBeGreaterThan(designed.formula.genome.rayDensity);
    expect(designEntryOf(tuned.formula)).toBeUndefined();
    expect(designLabelOf(tuned.formula)).not.toBe(DESIGN_GALLERY[3].label);
  });

  it('only offers a design badge on the authored frame', () => {
    expect(designEntryOf(initialDraft().formula)?.index).toBe(0);
    expect(designEntryOf(withPattern(initialDraft(), 'fractal').formula)).toBeUndefined();
  });

  it('clamps layer levels to 1..4 and rounds them', () => {
    expect(clampLayerLevel(9)).toBe(FRAME_LEVEL_MAX);
    expect(clampLayerLevel(-3)).toBe(FRAME_LEVEL_MIN);
    expect(clampLayerLevel(2.6)).toBe(3);
  });

  it('maps detail percentages onto the 0..1 intricacy range', () => {
    expect(detailValue(400)).toBe(1);
    expect(detailValue(-40)).toBe(0);
    expect(detailValue(37)).toBeCloseTo(0.37, 6);
    expect(detailPercent(0.375)).toBe(38);
  });

  it('edits detail and level independently of each other', () => {
    const draft = withDetail(withLevel(initialDraft(), 3), 75);
    expect(draft.intricacy).toBe(0.75);
    expect(draft.formula.level).toBe(3);
    expect(activePresetOf(draft.intricacy)?.id).toBe('ornate');
  });

  it('reports no preset between the named ones', () => {
    expect(activePresetOf(0.43)).toBeNull();
    expect(activePresetOf(INTRICACY_PRESETS[0].value)?.id).toBe(INTRICACY_PRESETS[0].id);
  });

  it('lists a row for every overlay source except the foundation', () => {
    const rows = layerOptionsOf(initialDraft().formula);
    const sources = FRAME_LAYER_SOURCES.map((layer) => layer.id);
    expect(rows.map((row) => row.source)).toEqual(sources);
    expect(layerOptionsOf(withPattern(initialDraft(), 'rosette').formula).map((row) => row.source)).not.toContain(
      'rosette'
    );
  });

  it('fills a layer row from the house defaults when the formula has no setting', () => {
    const bare = { ...initialDraft().formula, layers: undefined };
    const rows = layerOptionsOf(bare);
    expect(rows.every((row) => row.enabled === false)).toBe(true);
    expect(rows[0].level).toBe(2);
    expect(rows[0].label.length).toBeGreaterThan(0);
  });

  it('clamps the border weight and edits its genome', () => {
    const border = withBorderGene(withBorderWeight(defaultBorderStyle(), 250), 'wingDelta', 1);
    expect(border.weight).toBe(1);
    expect(border.genome.wingDelta).toBe(1);
    expect(withBorderWeight(defaultBorderStyle(), -5).weight).toBe(0);
  });

  it('gives each caller its own mutable default formula', () => {
    const first = defaultFrameFormula();
    first.genome.rayDensity = 99;
    expect(defaultFrameFormula().genome.rayDensity).not.toBe(99);
    expect(defaultBorderStyle().genome).toEqual(SIGNATURE_GENOME);
  });
});
