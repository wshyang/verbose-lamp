import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAME_LAYERS,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  FRAME_LAYER_SOURCES,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import {
  clampLayerLevel,
  defaultBorderStyle,
  defaultFrameFormula,
  detailPercent,
  detailValue,
  layerOptionsFor,
  presetForIntricacy,
  withFoundation,
  withLayerChanges,
} from './studioFormula';

describe('detail conversion', () => {
  it.each([
    [0, 0],
    [0.5, 50],
    [0.125, 13],
    [1, 100],
  ])('shows %s as %s percent', (value, percent) => {
    expect(detailPercent(value)).toBe(percent);
  });

  it.each([
    [-20, 0],
    [0, 0],
    [75, 0.75],
    [100, 1],
    [400, 1],
  ])('turns %s percent into %s, held to the unit range', (percent, value) => {
    expect(detailValue(percent)).toBe(value);
  });
});

describe('clampLayerLevel', () => {
  it.each([
    [-3, 1],
    [0, 1],
    [1, 1],
    [2.4, 2],
    [2.6, 3],
    [4, 4],
    [9, 4],
  ])('holds %s to %s', (level, expected) => {
    expect(clampLayerLevel(level)).toBe(expected);
  });
});

describe('defaults', () => {
  it('hands out a frame formula that shares nothing with the shared defaults', () => {
    const formula = defaultFrameFormula();

    expect(formula.genome).toEqual(SIGNATURE_GENOME);
    expect(formula.genome).not.toBe(SIGNATURE_GENOME);
    expect(formula.layers).toEqual(DEFAULT_FRAME_LAYERS);
    expect(formula.layers).not.toBe(DEFAULT_FRAME_LAYERS);
    expect(formula.layers![0]).not.toBe(DEFAULT_FRAME_LAYERS[0]);
  });

  it('hands out a border style with its own genome', () => {
    const border = defaultBorderStyle();

    expect(border).toEqual({ ...DEFAULT_SCREEN_BORDER_STYLE, genome: SIGNATURE_GENOME });
    expect(border.genome).not.toBe(SIGNATURE_GENOME);
  });
});

describe('withFoundation', () => {
  const lit = () => ({
    ...defaultFrameFormula(),
    level: 3,
    layers: FRAME_LAYER_SOURCES.map((pattern) => ({ source: pattern.id, enabled: true, level: 2 })),
  });

  it('switches off the layer that the new foundation would duplicate, and only that one', () => {
    const next = withFoundation(lit(), 'lattice');

    expect(next.source).toBe('lattice');
    expect(next.layers!.filter((layer) => !layer.enabled).map((layer) => layer.source)).toEqual(['lattice']);
  });

  it('keeps the level for a generated foundation', () => {
    expect(withFoundation(lit(), 'fractal').level).toBe(3);
  });

  it('restores the delivered level when returning to the authored frame', () => {
    expect(withFoundation(lit(), 'authored').level).toBe(DEFAULT_FRAME_STYLE.formula.level);
  });

  it('works from a formula that carries no layer list', () => {
    const bare = { ...defaultFrameFormula(), layers: undefined };

    expect(withFoundation(bare, 'lattice').layers).toHaveLength(DEFAULT_FRAME_LAYERS.length);
  });

  it('does not touch its input', () => {
    const before = lit();
    const snapshot = JSON.stringify(before);

    withFoundation(before, 'lattice');

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('withLayerChanges', () => {
  it('changes one layer and leaves the others', () => {
    const formula = defaultFrameFormula();
    const target = formula.layers![0].source;
    const next = withLayerChanges(formula, target, { enabled: true, level: 4 });

    expect(next.layers![0]).toMatchObject({ source: target, enabled: true, level: 4 });
    expect(next.layers!.slice(1)).toEqual(formula.layers!.slice(1));
  });

  it('does not touch its input', () => {
    const formula = defaultFrameFormula();
    const snapshot = JSON.stringify(formula);

    withLayerChanges(formula, formula.layers![0].source, { enabled: true });

    expect(JSON.stringify(formula)).toBe(snapshot);
  });
});

describe('layerOptionsFor', () => {
  it('offers every composable layer except the foundation', () => {
    const options = layerOptionsFor({ ...defaultFrameFormula(), source: 'lattice' });

    expect(options.map((option) => option.source)).toEqual(
      FRAME_LAYER_SOURCES.filter((pattern) => pattern.id !== 'lattice').map((pattern) => pattern.id)
    );
  });

  it('reports the enabled flag and level from the formula', () => {
    const formula = withLayerChanges(defaultFrameFormula(), FRAME_LAYER_SOURCES[0].id, { enabled: true, level: 4 });
    const first = layerOptionsFor(formula).find((option) => option.source === FRAME_LAYER_SOURCES[0].id);

    expect(first).toMatchObject({ enabled: true, level: 4, label: FRAME_LAYER_SOURCES[0].label });
  });

  it('falls back to off at level 2 for a layer the formula does not list', () => {
    const options = layerOptionsFor({ ...defaultFrameFormula(), layers: [] });

    expect(options.every((option) => !option.enabled && option.level === 2)).toBe(true);
  });
});

describe('presetForIntricacy', () => {
  it.each(INTRICACY_PRESETS.map((preset) => [preset.id, preset.value] as const))('finds the %s preset', (id, value) => {
    expect(presetForIntricacy(value)?.id).toBe(id);
  });

  it('matches by whole percent, so rounding noise still lands on the preset', () => {
    const preset = INTRICACY_PRESETS[0];

    expect(presetForIntricacy(preset.value + 0.002)?.id).toBe(preset.id);
  });

  it('has no preset for a hand-set value', () => {
    expect(presetForIntricacy(0.37)).toBeNull();
  });
});
