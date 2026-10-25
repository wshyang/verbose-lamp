import { describe, expect, it } from 'vitest';
import { INTRICACY_PRESETS } from '@/features/art-deco-frame';
import { designAt } from '../data/frameDesigns';
import { withFoundation } from './studioFormula';
import { defaultBorderStyle, defaultFrameFormula } from './studioFormula';
import { borderView, sequenceView } from './studioView';

describe('sequenceView', () => {
  it('names the gallery design the authored frame currently shows', () => {
    const view = sequenceView(defaultFrameFormula(), 0.5);

    expect(view.isDesignPattern).toBe(true);
    expect(view.activeDesignIndex).toBe(0);
    expect(view.designLabel).toBeTruthy();
  });

  it('follows the gallery when its genome is adopted', () => {
    const formula = { ...defaultFrameFormula(), genome: designAt(2).genome };

    expect(sequenceView(formula, 0.5).activeDesignIndex).toBe(2);
  });

  it('has no design for a generated foundation, even with a gallery genome', () => {
    const formula = withFoundation({ ...defaultFrameFormula(), genome: designAt(2).genome }, 'fractal');
    const view = sequenceView(formula, 0.5);

    expect(view.isDesignPattern).toBe(false);
    expect(view.activeDesignIndex).toBeNull();
  });

  it('calls a hand-edited genome custom', () => {
    const formula = { ...defaultFrameFormula(), genome: { ...defaultFrameFormula().genome, rayDensity: 1.35 } };
    const view = sequenceView(formula, 0.5);

    expect(view.activeDesignIndex).toBeNull();
    expect(view.designLabel).toContain('Custom');
  });

  it('reports intricacy as a whole percent and finds its preset', () => {
    const preset = INTRICACY_PRESETS[1];
    const view = sequenceView(defaultFrameFormula(), preset.value);

    expect(view.detailPercent).toBe(Math.round(preset.value * 100));
    expect(view.activePreset?.id).toBe(preset.id);
  });

  it('leaves the foundation out of the layer list', () => {
    const view = sequenceView({ ...defaultFrameFormula(), source: 'lattice' }, 0.5);

    expect(view.layers.some((layer) => layer.source === 'lattice')).toBe(false);
  });
});

describe('borderView', () => {
  it('reads an unset pattern as the printed poster', () => {
    expect(borderView({ ...defaultBorderStyle(), pattern: undefined }).borderPattern).toBe('poster');
  });

  it('reports weight as a whole percent', () => {
    expect(borderView({ ...defaultBorderStyle(), weight: 0.85 }).borderWeight).toBe(85);
  });

  it('hands out the genome it was given', () => {
    const border = defaultBorderStyle();

    expect(borderView(border).genome).toBe(border.genome);
  });
});
