import { describe, expect, it } from 'vitest';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { GILDING_TONE_RANGES, gildingSliderValue, withGildingTone } from './gilding';

describe('gilding tone edits', () => {
  const bullion = GILDING_PRESETS[0].params;

  it('maps clarity to percent sliders and back', () => {
    expect(gildingSliderValue(bullion, GILDING_TONE_RANGES[0])).toBe(85);
    expect(withGildingTone(bullion, { key: 'clarity', sliderValue: 120 }).clarity).toBe(1.2);
  });

  it('clamps to the studio ranges without mutating', () => {
    expect(withGildingTone(bullion, { key: 'folds', sliderValue: 9 }).folds).toBe(4);
    expect(withGildingTone(bullion, { key: 'levels', sliderValue: -5 }).levels).toBe(0);
    expect(withGildingTone(bullion, { key: 'levels', sliderValue: Number.NaN })).toBe(bullion);
    expect(bullion.folds).toBe(2);
  });
});
