// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSpectacleStage } from './useSpectacleStage';

const stageFactory = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('../engine/createSpectacleStage', () => ({
  createSpectacleStage: (options: unknown) => stageFactory.create(options),
}));

function makeStage() {
  return {
    play: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })),
    stopAll: vi.fn(),
    setReducedMotion: vi.fn(),
    dispose: vi.fn(),
    qualityTier: 'high' as const,
  };
}

function hostRef() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { current: host };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSpectacleStage', () => {
  it('creates the stage for the host and reports readiness', () => {
    const stage = makeStage();
    stageFactory.create.mockReturnValue(stage);
    const ref = hostRef();
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef: ref, reducedMotion: false, onAnnounce: vi.fn() }),
    );
    expect(stageFactory.create).toHaveBeenCalledWith(
      expect.objectContaining({ host: ref.current, reducedMotion: false }),
    );
    expect(result.current.qualityTier).toBe('high');
    expect(result.current.isReady).toBe(true);
  });

  it('forwards play and stop to the live stage', () => {
    const stage = makeStage();
    stageFactory.create.mockReturnValue(stage);
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef: hostRef(), reducedMotion: false, onAnnounce: vi.fn() }),
    );
    act(() => {
      result.current.play('confetti', { mode: 'rain', seed: 1 });
    });
    expect(stage.play).toHaveBeenCalledWith('confetti', { mode: 'rain', seed: 1 });
    act(() => result.current.stopAll());
    expect(stage.stopAll).toHaveBeenCalledTimes(1);
  });

  it('returns a no-op handle before the stage exists', () => {
    const ref: { current: HTMLDivElement | null } = { current: null };
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef: ref, reducedMotion: false, onAnnounce: vi.fn() }),
    );
    expect(stageFactory.create).not.toHaveBeenCalled();
    expect(result.current.isReady).toBe(false);

    const handle = result.current.play('confetti', { mode: 'rain', seed: 1 });
    expect(handle.stop).toBeTypeOf('function');
    expect(() => handle.stop()).not.toThrow();
    expect(() => result.current.stopAll()).not.toThrow();
    expect(stageFactory.create).not.toHaveBeenCalled();
  });

  it('keeps the stage in sync with reduced motion', () => {
    const stage = makeStage();
    stageFactory.create.mockReturnValue(stage);
    const ref = hostRef();
    const { rerender } = renderHook(
      ({ reducedMotion }) => useSpectacleStage({ hostRef: ref, reducedMotion, onAnnounce: vi.fn() }),
      { initialProps: { reducedMotion: false } },
    );
    rerender({ reducedMotion: true });
    expect(stage.setReducedMotion).toHaveBeenCalledWith(true);
  });

  it('disposes the stage on unmount', () => {
    const stage = makeStage();
    stageFactory.create.mockReturnValue(stage);
    const ref = hostRef();
    const onAnnounce = vi.fn();
    const { unmount } = renderHook(() =>
      useSpectacleStage({ hostRef: ref, reducedMotion: false, onAnnounce }),
    );
    unmount();
    expect(stage.dispose).toHaveBeenCalledTimes(1);
  });
});
