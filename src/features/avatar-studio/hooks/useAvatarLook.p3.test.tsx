// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { DEFAULT_BACKDROPS } from '@/features/enamel-backdrop';

import { GILDING_PRESETS } from '@/features/gilded-portrait';

import { useAvatarLook } from './useAvatarLook';

describe('useAvatarLook', () => {
  it('opens on Wei_Ling’s studio defaults', () => {
    const { result } = renderHook(() => useAvatarLook());
    expect(result.current.backdrop).toEqual(DEFAULT_BACKDROPS[0].spec);
    expect(result.current.finish).toBe('natural');
    expect(result.current.frame).toBe('medallion');
    expect(result.current.gilding).toEqual(GILDING_PRESETS[0].params);
    expect(result.current.gildingPresetId).toBe(GILDING_PRESETS[0].id);
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.isFineTuning).toBe(false);
  });

  it('swaps the whole backdrop for a preset', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.applyBackdropPreset(DEFAULT_BACKDROPS[1]));
    expect(result.current.backdrop).toEqual(DEFAULT_BACKDROPS[1].spec);
  });

  it('edits pattern kind, pattern knobs and finish knobs', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.setPatternKnob('rays', 12));
    expect((result.current.backdrop.pattern as { rays: number }).rays).toBe(12);

    act(() => result.current.choosePattern('chevron'));
    expect(result.current.backdrop.pattern.kind).toBe('chevron');

    act(() => result.current.setSpecKnob('bands', 4));
    expect(result.current.backdrop.bands).toBe(4);

    act(() => result.current.choosePalette({ name: 'Test', colourOne: '#101010', colourTwo: '#202020' } as never));
    expect(result.current.backdrop.colourOne).toBe('#101010');

    act(() => result.current.setColour('colourTwo', '#abcdef'));
    expect(result.current.backdrop.colourTwo).toBe('#abcdef');
    act(() => result.current.setColour('colourOne', 'not-a-colour'));
    expect(result.current.backdrop.colourOne).toBe('#101010');

    act(() => result.current.setInlay('gilded-bands'));
    expect(result.current.backdrop.inlay).toBe('gilded-bands');
  });

  it('tunes the cut-out and can reset it', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.setTuningKnob('threshold', 42));
    expect(result.current.tuning.threshold).toBe(42);
    act(() => result.current.setBackgroundRemoved(false));
    expect(result.current.tuning.removeBackground).toBe(false);
    act(() => result.current.resetTuning());
    expect(result.current.tuning.removeBackground).toBe(true);
  });

  it('applies gilding presets, then clears the marker once hand-tuned', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.applyGildingPreset(GILDING_PRESETS[2]));
    expect(result.current.gildingPresetId).toBe(GILDING_PRESETS[2].id);
    expect(result.current.gilding).toEqual(GILDING_PRESETS[2].params);

    act(() => result.current.setGildingRamp('deep'));
    expect(result.current.gilding.rampId).toBe('deep');
    expect(result.current.gildingPresetId).toBeNull();

    act(() => result.current.setGildingTone('clarity', 40));
    expect(result.current.gilding.clarity).toBeCloseTo(0.4, 3);
    expect(result.current.gildingPresetId).toBeNull();
  });

  it('toggles the sheen, fine tuning, finish and frame', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.toggleShimmer());
    expect(result.current.isShimmering).toBe(false);
    act(() => result.current.toggleFineTuning());
    expect(result.current.isFineTuning).toBe(true);
    act(() => result.current.setFinish('gilded'));
    expect(result.current.finish).toBe('gilded');
    act(() => result.current.setFrame('plaque'));
    expect(result.current.frame).toBe('plaque');
  });

  it('returns to the studio defaults for a sample', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => {
      result.current.setFrame('plaque');
      result.current.setFinish('gilded');
      result.current.applyGildingPreset(GILDING_PRESETS[1]);
      result.current.choosePattern('chevron');
    });
    act(() => result.current.applySampleDefaults());
    expect(result.current.frame).toBe('medallion');
    expect(result.current.finish).toBe('natural');
    expect(result.current.gildingPresetId).toBe(GILDING_PRESETS[0].id);
    expect(result.current.backdrop).toEqual(DEFAULT_BACKDROPS[0].spec);
  });
});
