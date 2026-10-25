// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { DEFAULT_BACKDROPS } from '@/features/enamel-backdrop';

import { GILDING_PRESETS } from '@/features/gilded-portrait';

import { useAvatarLook } from './useAvatarLook';

import { setupDomTests } from '@/test/dom';

import { DEFAULT_TUNING } from '@/features/background-removal';

setupDomTests();
const mount = () => renderHook(() => useAvatarLook());
describe('backdrop actions', () => {
  it('adopts a preset spec wholesale', () => {
    const { result } = mount();
    const preset = DEFAULT_BACKDROPS[1];

    act(() => result.current.applyBackdropPreset(preset));

    expect(result.current.backdrop).toEqual(preset.spec);
  });

  it('switches the pattern kind', () => {
    const { result } = mount();
    const kind = result.current.backdrop.pattern.kind === 'radiance' ? 'swirl' : 'radiance';

    act(() => result.current.choosePattern(kind));

    expect(result.current.backdrop.pattern.kind).toBe(kind);
  });

  it('applies a pattern knob, clamped and stepped', () => {
    const { result } = mount();
    const [knob] = Object.entries(result.current.backdrop.pattern).filter(
      ([, value]) => typeof value === 'number'
    ) as Array<[string, number]>;

    act(() => result.current.setPatternKnob(knob[0], knob[1] + 1_000));

    const next = result.current.backdrop.pattern as unknown as Record<string, number>;
    expect(next[knob[0]]).toBeGreaterThanOrEqual(knob[1]);
    expect(Number.isFinite(next[knob[0]])).toBe(true);
  });

  it('applies a spec knob', () => {
    const { result } = mount();

    act(() => result.current.setSpecKnob('gilt', 0.4));

    expect(result.current.backdrop.gilt).toBeCloseTo(0.4, 3);
  });

  it('sets each enamel colour independently', () => {
    const { result } = mount();

    act(() => result.current.setColour('colourOne', '#abcdef'));
    expect(result.current.backdrop.colourOne).toBe('#abcdef');

    act(() => result.current.setColour('colourTwo', '#fedcba'));
    expect(result.current.backdrop.colourTwo).toBe('#fedcba');
  });

  it('swaps the inlay style', () => {
    const { result } = mount();

    act(() => result.current.setInlay('gilded-bands'));

    expect(result.current.backdrop.inlay).toBe('gilded-bands');
  });
});
describe('cut-out tuning', () => {
  it('moves one knob without disturbing the rest', () => {
    const { result } = mount();

    act(() => result.current.setTuningKnob('threshold', 176));

    expect(result.current.tuning.threshold).toBe(176);
    expect(result.current.tuning.removeBackground).toBe(DEFAULT_TUNING.removeBackground);
  });

  it('turns background removal off and back on', () => {
    const { result } = mount();

    act(() => result.current.setBackgroundRemoved(false));
    expect(result.current.tuning.removeBackground).toBe(false);

    act(() => result.current.setBackgroundRemoved(true));
    expect(result.current.tuning.removeBackground).toBe(true);
  });

  it('resets every knob', () => {
    const { result } = mount();

    act(() => result.current.setTuningKnob('edge', 2));
    act(() => result.current.resetTuning());

    expect(result.current.tuning).toEqual(DEFAULT_TUNING);
  });
});
describe('subject finish, frame and gilding', () => {
  it('switches the finish and the frame', () => {
    const { result } = mount();

    act(() => result.current.setFinish('gilded'));
    act(() => result.current.setFrame('plaque'));

    expect(result.current.finish).toBe('gilded');
    expect(result.current.frame).toBe('plaque');
  });

  it('adopts a gilding preset and clears the badge once hand-tuned', () => {
    const { result } = mount();
    const preset = GILDING_PRESETS[2];

    act(() => result.current.applyGildingPreset(preset));
    expect(result.current.gilding).toEqual(preset.params);
    expect(result.current.gildingPresetId).toBe(preset.id);

    act(() => result.current.setGildingRamp('champagne'));
    expect(result.current.gilding.rampId).toBe('champagne');
    expect(result.current.gildingPresetId).toBeNull();
  });

  it('moves a gilding tone from slider units', () => {
    const { result } = mount();

    act(() => result.current.setGildingTone('clarity', 120));

    expect(result.current.gilding.clarity).toBeCloseTo(1.2, 6);
    expect(result.current.gildingPresetId).toBeNull();
  });
});
describe('view toggles and reset', () => {
  it('toggles shimmer and the fine-tuning panel', () => {
    const { result } = mount();

    act(() => result.current.toggleShimmer());
    expect(result.current.isShimmering).toBe(false);
    act(() => result.current.toggleShimmer());
    expect(result.current.isShimmering).toBe(true);

    act(() => result.current.toggleFineTuning());
    expect(result.current.isFineTuning).toBe(true);
    act(() => result.current.toggleFineTuning());
    expect(result.current.isFineTuning).toBe(false);
  });

  it('restores every sample default', () => {
    const { result } = mount();

    act(() => result.current.setFinish('tinted'));
    act(() => result.current.setFrame('plaque'));
    act(() => result.current.setTuningKnob('edge', 2));
    act(() => result.current.applyGildingPreset(GILDING_PRESETS[1]));
    act(() => result.current.choosePattern('radiance'));

    act(() => result.current.applySampleDefaults());

    expect(result.current.finish).toBe('natural');
    expect(result.current.frame).toBe('medallion');
    expect(result.current.tuning).toEqual(DEFAULT_TUNING);
    expect(result.current.gilding).toEqual(GILDING_PRESETS[0].params);
    expect(result.current.gildingPresetId).toBe(GILDING_PRESETS[0].id);
    expect(result.current.backdrop).toEqual(DEFAULT_BACKDROPS[0].spec);
  });
});
