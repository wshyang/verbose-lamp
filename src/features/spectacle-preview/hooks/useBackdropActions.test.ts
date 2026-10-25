// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import type { EffectRunner } from './useEffectRunner';
import type { StageSettings } from './useStageSettings';
import { useBackdropActions } from './useBackdropActions';

setupDomTests();

const speaker = { x: 0.4, y: 0.3, w: 0.2, h: 0.2 };

function runner(playing: string[] = []): EffectRunner {
  return {
    playing: new Set(playing),
    run: vi.fn(),
    toggle: vi.fn(),
    stopKey: vi.fn(),
    stopAll: vi.fn(),
  };
}

function settings(overrides: Partial<StageSettings> = {}): StageSettings {
  return {
    origin: { x: 0.5, y: 0.42 },
    picking: false,
    setPicking: vi.fn(),
    intensity: 0.6,
    setIntensity: vi.fn(),
    seed: 1925,
    setSeed: vi.fn(),
    rerollSeed: vi.fn(),
    keepClearOn: false,
    setKeepClearOn: vi.fn(),
    keepClear: [],
    speaker,
    moveSpeaker: vi.fn(),
    onStageClick: vi.fn(() => false),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useBackdropActions', () => {
  it('toggles the continuous fireworks show with the shared settings', () => {
    const r = runner();
    const s = settings({ keepClear: [speaker] });
    const { result } = renderHook(() => useBackdropActions({ runner: r, settings: s }));

    result.current.toggleFireworks();

    expect(r.toggle).toHaveBeenCalledWith('fireworks', 'fireworks', {
      continuous: true,
      intensity: 0.6,
      seed: 1925,
      keepClear: [speaker],
      greenLight: true,
    });
  });

  it('plays the finale at full intensity', () => {
    const r = runner();
    const { result } = renderHook(() => useBackdropActions({ runner: r, settings: settings() }));

    result.current.playFinale();

    expect(r.run).toHaveBeenCalledWith('finale', 'fireworks', {
      finale: true,
      intensity: 1,
      seed: 1925,
      keepClear: [],
      greenLight: true,
    });
  });

  it('toggles searchlights and champagne', () => {
    const r = runner();
    const { result } = renderHook(() => useBackdropActions({ runner: r, settings: settings() }));

    result.current.toggleSearchlights();
    result.current.toggleChampagne();

    const calls = (r.toggle as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toEqual([
      ['searchlights', 'searchlights', { beams: 3, seed: 1925, keepClear: [] }],
      ['champagne', 'champagne', { seed: 1925 }],
    ]);
  });

  it('restarts a live show shortly after the keep-clear box changes', () => {
    vi.useFakeTimers();
    const r = runner(['fireworks']);
    const { result, rerender } = renderHook(
      ({ clear }: { clear: boolean }) =>
        useBackdropActions({ runner: r, settings: settings({ keepClear: clear ? [speaker] : [] }) }),
      { initialProps: { clear: false } },
    );

    rerender({ clear: true });
    expect(r.stopKey).not.toHaveBeenCalled();

    vi.advanceTimersByTime(349);
    expect(r.stopKey).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(r.stopKey).toHaveBeenCalledWith('fireworks');
    expect(r.run).toHaveBeenCalledWith('fireworks', 'fireworks', {
      continuous: true,
      intensity: 0.6,
      seed: 1925,
      keepClear: [speaker],
      greenLight: true,
    });
    expect(result.current.toggleFireworks).toBeTypeOf('function');
  });

  it('does not restart when the show is not live', () => {
    vi.useFakeTimers();
    const r = runner();
    const { rerender } = renderHook(
      ({ clear }: { clear: boolean }) =>
        useBackdropActions({ runner: r, settings: settings({ keepClear: clear ? [speaker] : [] }) }),
      { initialProps: { clear: false } },
    );

    rerender({ clear: true });
    vi.advanceTimersByTime(400);

    expect(r.stopKey).not.toHaveBeenCalled();
  });

  it('remembers the keep-clear box the toggle started with', () => {
    vi.useFakeTimers();
    const r = runner(['fireworks']);
    const { result, rerender } = renderHook(
      ({ clear }: { clear: boolean }) =>
        useBackdropActions({ runner: r, settings: settings({ keepClear: clear ? [speaker] : [] }) }),
      { initialProps: { clear: false } },
    );

    result.current.toggleFireworks();
    rerender({ clear: true });
    vi.advanceTimersByTime(400);

    expect(r.stopKey).toHaveBeenCalledTimes(1);
  });
});
