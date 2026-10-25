import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_LAYERS, type FrameFormula, type FramePatternLayer } from '@/features/art-deco-frame';
import { layerSettingsOf, layerViewOf } from './layerView';

describe('layerSettingsOf', () => {
  it('hands back the formula layers when the sequence has them', () => {
    const layers = [{ source: 'fractal', enabled: true, level: 3 }] as readonly FramePatternLayer[];
    expect(layerSettingsOf({ layers } as FrameFormula)).toBe(layers);
  });

  it('falls back to the house layers for a formula saved without them', () => {
    const formula = {} as FrameFormula;
    expect(layerSettingsOf(formula)).toBe(DEFAULT_FRAME_LAYERS);
  });
});

describe('layerViewOf', () => {
  it('reports the saved state of a layer', () => {
    const settings = [{ source: 'fractal', enabled: true, level: 3 }] as readonly FramePatternLayer[];
    expect(layerViewOf(settings, 'fractal')).toEqual({ source: 'fractal', enabled: true, level: 3 });
  });

  it('defaults a source with no saved state to off, level 2', () => {
    expect(layerViewOf([], 'rosette')).toEqual({ source: 'rosette', enabled: false, level: 2 });
  });
});
