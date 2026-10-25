// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { GILDING_PRESETS, GOLD_RAMPS } from '@/features/gilded-portrait';
import { useAvatarLook } from '../hooks/useAvatarLook';
import type { AvatarLook } from '../hooks/useAvatarLook';
import { GildingControls } from './GildingControls';

setupDomTests();

const spies = (value: AvatarLook): AvatarLook => ({
  ...value,
  applyGildingPreset: vi.fn(),
  setGildingRamp: vi.fn(),
  setGildingTone: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

const mount = (value: AvatarLook = spies(renderHook(() => useAvatarLook()).result.current)) => ({
  value,
  ...render(<GildingControls look={value} />),
});

describe('GildingControls', () => {
  it('lists every gilding preset and marks the active one', () => {
    const { value } = mount();

    const chips = screen.getAllByTestId('avatar-studio__gilding-preset');
    expect(chips).toHaveLength(GILDING_PRESETS.length);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(value.gildingPresetId).toBe(GILDING_PRESETS[0].id);
  });

  it('applies a preset', () => {
    const { value } = mount();

    fireEvent.click(screen.getAllByTestId('avatar-studio__gilding-preset')[1]);

    expect(value.applyGildingPreset).toHaveBeenCalledWith(GILDING_PRESETS[1]);
  });

  it('swaps the gold ramp from the tone row', () => {
    const { value } = mount();

    const tones = screen.getAllByTestId('avatar-studio__gold-tone');
    expect(tones).toHaveLength(Object.values(GOLD_RAMPS).length);
    expect(tones[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(tones[1]);

    expect(value.setGildingRamp).toHaveBeenCalledWith(Object.values(GOLD_RAMPS)[1].id);
  });

  it('moves each gilding tone from slider units', () => {
    const { value } = mount();

    fireEvent.change(screen.getByTestId('avatar-studio__gilding-clarity'), {
      target: { value: '90' },
    });
    expect(value.setGildingTone).toHaveBeenCalledWith('clarity', 90);

    fireEvent.change(screen.getByTestId('avatar-studio__gilding-levels'), {
      target: { value: '40' },
    });
    expect(value.setGildingTone).toHaveBeenCalledWith('levels', 40);

    // The default look already sits at 2 folds: a no-op change fires no event.
    fireEvent.change(screen.getByTestId('avatar-studio__gilding-folds'), {
      target: { value: '4' },
    });
    expect(value.setGildingTone).toHaveBeenCalledWith('folds', 4);
  });

  it('shows clarity as a percentage and the others as plain numbers', () => {
    const base = renderHook(() => useAvatarLook()).result.current;
    const value = spies({
      ...base,
      gilding: { ...base.gilding, clarity: 1.25, levels: 55, folds: 3 },
    });
    mount(value);

    expect(screen.getByText('125%')).toBeTruthy();
    expect(screen.getByText('55')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
