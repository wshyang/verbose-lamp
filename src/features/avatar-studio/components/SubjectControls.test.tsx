// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { useAvatarLook, type AvatarLook } from '../hooks/useAvatarLook';
import { SubjectControls } from './SubjectControls';

setupDomTests();

const spies = (value: AvatarLook): AvatarLook => ({
  ...value,
  setFinish: vi.fn(),
  setFrame: vi.fn(),
  toggleShimmer: vi.fn(),
  applyGildingPreset: vi.fn(),
  setGildingRamp: vi.fn(),
  setGildingTone: vi.fn(),
});

const look = (overrides: Record<string, unknown> = {}) =>
  spies({ ...renderHook(() => useAvatarLook()).result.current, ...overrides });

const mount = (value: AvatarLook) => ({ value, view: render(<SubjectControls look={value} />) });

describe('SubjectControls', () => {
  it('offers the three finishes and marks the active one', () => {
    const { value } = mount(look());

    const chips = screen.getAllByTestId('avatar-studio__subject-finish');
    expect(chips).toHaveLength(3);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[0].getAttribute('title')).toContain('gold outline');

    fireEvent.click(chips[2]);
    expect(value.setFinish).toHaveBeenCalledWith('gilded');
  });

  it('swaps the frame shape and the sheen', () => {
    const { value } = mount(look());

    const frames = screen.getAllByTestId('avatar-studio__frame-shape');
    expect(frames).toHaveLength(2);
    fireEvent.click(frames[1]);
    expect(value.setFrame).toHaveBeenCalledWith('plaque');

    fireEvent.click(screen.getByTestId('avatar-studio__shimmer'));
    expect(value.toggleShimmer).toHaveBeenCalledTimes(1);
  });

  it('shows gilding controls only for the gilded finish', () => {
    const natural = mount(look({ finish: 'natural' }));
    expect(screen.queryByTestId('avatar-studio__gilding-preset')).toBeNull();
    natural.view.unmount();

    mount(look({ finish: 'gilded' }));
    expect(screen.getAllByTestId('avatar-studio__gilding-preset').length).toBeGreaterThan(0);
  });

  it('shows the gold tone row for both gold finishes but gilding knobs only for one', () => {
    const natural = mount(look({ finish: 'natural' }));
    expect(screen.queryAllByTestId('avatar-studio__gold-tone')).toHaveLength(0);
    natural.view.unmount();

    const tinted = mount(look({ finish: 'tinted' }));
    expect(screen.getAllByTestId('avatar-studio__gold-tone').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('avatar-studio__gilding-preset')).toHaveLength(0);
    tinted.view.unmount();

    mount(look({ finish: 'gilded' }));
    // The full gilding panel repeats the tone row and adds presets and knobs.
    expect(screen.getAllByTestId('avatar-studio__gold-tone').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('avatar-studio__gilding-preset').length).toBeGreaterThan(0);
  });
});
