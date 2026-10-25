// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import type { EffectRunner } from './useEffectRunner';
import { useCelebrationActions } from './useCelebrationActions';

setupDomTests();

function stubRunner() {
  const run = vi.fn();
  const runner: EffectRunner = {
    playing: new Set<string>(),
    run,
    toggle: vi.fn(),
    stopKey: vi.fn(),
    stopAll: vi.fn(),
  };
  return { runner, run };
}

const origin = { x: 0.5, y: 0.5 };

describe('useCelebrationActions', () => {
  it('plays confetti under a mode-specific key, seeded from the caller', () => {
    const { runner, run } = stubRunner();
    const { result } = renderHook(() =>
      useCelebrationActions({ runner, origin, seed: 1925, onCountdownComplete: () => {} }),
    );

    result.current.playConfetti('burst');
    result.current.playConfetti('rain');

    expect(run.mock.calls[0]).toEqual(['confetti-burst', 'confetti', { mode: 'burst', origin, seed: 1925 }]);
    expect(run.mock.calls[1]).toEqual(['confetti-rain', 'confetti', { mode: 'rain', origin, seed: 1925 }]);
  });

  it('counts down from five and chains the completion callback', () => {
    const { runner, run } = stubRunner();
    const onCountdownComplete = vi.fn();
    const { result } = renderHook(() =>
      useCelebrationActions({ runner, origin, seed: 1, onCountdownComplete }),
    );

    result.current.playCountdown();

    const [key, id, params] = run.mock.calls[0];
    expect([key, id]).toEqual(['countdown', 'countdown']);
    expect(params.from).toBe(5);
    expect(params.onComplete).toBe(onCountdownComplete);
  });

  it('reveals the winner by name', () => {
    const { runner, run } = stubRunner();
    const { result } = renderHook(() =>
      useCelebrationActions({ runner, origin, seed: 1, onCountdownComplete: () => {} }),
    );

    result.current.playNameReveal();

    expect(run.mock.calls[0]).toEqual([
      'name-reveal',
      'name-reveal',
      { name: 'Jay Gatsby', subtitle: 'Lucky draw winner' },
    ]);
  });

  it('plays a sparkler show keyed by its size', () => {
    const { runner, run } = stubRunner();
    const { result } = renderHook(() =>
      useCelebrationActions({ runner, origin, seed: 7, onCountdownComplete: () => {} }),
    );

    result.current.playSparklers(5);

    expect(run.mock.calls[0]).toEqual([
      'sparkler-5',
      'sparkler',
      { origin, count: 5, seed: 7, intensity: 0.9 },
    ]);
  });
});
