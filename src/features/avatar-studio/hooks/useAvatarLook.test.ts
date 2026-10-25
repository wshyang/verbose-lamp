// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '@/features/background-removal';
import { DEFAULT_BACKDROPS, ENAMEL_PALETTES } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { useAvatarLook } from './useAvatarLook';

describe('useAvatarLook', () => {
  it('starts with the Wei_Ling defaults and stable action identities', () => {
    const { result, rerender } = renderHook(() => useAvatarLook());
    expect(result.current).toMatchObject({
      backdrop: DEFAULT_BACKDROPS[0].spec,
      tuning: DEFAULT_TUNING,
      finish: 'natural',
      frame: 'medallion',
      gilding: GILDING_PRESETS[0].params,
      gildingPresetId: GILDING_PRESETS[0].id,
      isShimmering: true,
      isFineTuning: false,
    });
    const actions = result.current.applyBackdropPreset;
    rerender();
    expect(result.current.applyBackdropPreset).toBe(actions);
  });

  it('forwards every backdrop mutation through the pure spec helpers', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.applyBackdropPreset(DEFAULT_BACKDROPS[1]));
    expect(result.current.backdrop).toBe(DEFAULT_BACKDROPS[1].spec);
    act(() => result.current.choosePattern('sunburst'));
    expect(result.current.backdrop.pattern).toEqual({ kind: 'sunburst', rays: 12, twist: 4 });
    act(() => result.current.setPatternKnob('rays', 7));
    expect(result.current.backdrop.pattern).toMatchObject({ rays: 7 });
    act(() => result.current.setSpecKnob('gilt', 0.8));
    expect(result.current.backdrop.gilt).toBe(0.8);
    act(() => result.current.choosePalette(ENAMEL_PALETTES[2]));
    expect(result.current.backdrop).toMatchObject({
      colourOne: ENAMEL_PALETTES[2].colourOne,
      colourTwo: ENAMEL_PALETTES[2].colourTwo,
    });
    act(() => result.current.setColour('colourOne', '#123456'));
    act(() => result.current.setColour('colourTwo', '#abcdef'));
    expect(result.current.backdrop).toMatchObject({ colourOne: '#123456', colourTwo: '#abcdef' });
    act(() => result.current.setInlay('gilded-bands'));
    expect(result.current.backdrop.inlay).toBe('gilded-bands');
  });

  it('updates cut-out tuning and resets it independently', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.setTuningKnob('edge', 9));
    expect(result.current.tuning.edge).toBe(2);
    act(() => result.current.setBackgroundRemoved(false));
    expect(result.current.tuning.removeBackground).toBe(false);
    act(() => result.current.setBackgroundRemoved(true));
    expect(result.current.tuning.removeBackground).toBe(true);
    act(() => result.current.resetTuning());
    expect(result.current.tuning).toBe(DEFAULT_TUNING);
  });

  it('updates finish, frame, gilding, toggles, and sample defaults', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.setFinish('gilded'));
    act(() => result.current.setFrame('plaque'));
    act(() => result.current.applyGildingPreset(GILDING_PRESETS[1]));
    expect(result.current).toMatchObject({
      finish: 'gilded',
      frame: 'plaque',
      gilding: GILDING_PRESETS[1].params,
      gildingPresetId: GILDING_PRESETS[1].id,
    });
    act(() => result.current.setGildingRamp('deep'));
    expect(result.current.gilding.rampId).toBe('deep');
    expect(result.current.gildingPresetId).toBeNull();
    act(() => result.current.setGildingTone('clarity', 50));
    expect(result.current.gilding.clarity).not.toBe(GILDING_PRESETS[1].params.clarity);
    act(() => result.current.toggleShimmer());
    act(() => result.current.toggleFineTuning());
    expect(result.current).toMatchObject({ isShimmering: false, isFineTuning: true });
    act(() => result.current.toggleShimmer());
    act(() => result.current.toggleFineTuning());
    act(() => result.current.setTuningKnob('threshold', 99));
    act(() => result.current.applySampleDefaults());
    expect(result.current).toMatchObject({
      backdrop: DEFAULT_BACKDROPS[0].spec,
      tuning: DEFAULT_TUNING,
      finish: 'natural',
      frame: 'medallion',
      gilding: GILDING_PRESETS[0].params,
      gildingPresetId: GILDING_PRESETS[0].id,
      isShimmering: true,
      isFineTuning: false,
    });
  });
});
