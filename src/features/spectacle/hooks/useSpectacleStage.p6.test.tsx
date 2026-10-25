// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { useSpectacleStage } from './useSpectacleStage';

import { setupDomTests } from '@/test/dom';

import { type SpectacleStage } from '../model/types';

setupDomTests();
const engine = vi.hoisted(() => ({
  createSpectacleStage: vi.fn(),
  stage: {
    qualityTier: 'medium' as const,
    play: vi.fn(),
    stopAll: vi.fn(),
    setReducedMotion: vi.fn(),
    dispose: vi.fn(),
  },
}));
vi.mock('../engine/createSpectacleStage', () => ({
  createSpectacleStage: engine.createSpectacleStage,
}));
const host = () => {
  const element = document.createElement('div');
  return { hostRef: { current: element }, element };
};
/**
 * The announcement sink is an effect dependency, so it must be stable: an inline
 * `vi.fn()` would rebuild the stage on every render.
 */
const announce = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  engine.createSpectacleStage.mockReturnValue(engine.stage as unknown as SpectacleStage);
  engine.stage.play.mockReturnValue({ finished: Promise.resolve(), stop: vi.fn() });
});
describe('useSpectacleStage', () => {
  it('creates the stage once for the host element', () => {
    const { hostRef, element } = host();
    const onAnnounce = vi.fn();
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef, reducedMotion: false, onAnnounce })
    );

    expect(engine.createSpectacleStage).toHaveBeenCalledTimes(1);
    expect(engine.createSpectacleStage).toHaveBeenCalledWith({
      host: element,
      onAnnounce,
      reducedMotion: false,
    });
    expect(result.current.qualityTier).toBe('medium');
    expect(result.current.isReady).toBe(true);
  });

  it('waits for a host element instead of creating a stray stage', () => {
    const hostRef = { current: null };
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef, reducedMotion: false, onAnnounce: announce })
    );

    expect(engine.createSpectacleStage).not.toHaveBeenCalled();
    expect(result.current.isReady).toBe(false);
    expect(result.current.qualityTier).toBeNull();
  });

  it('hands out an inert handle before the stage exists', async () => {
    const hostRef = { current: null };
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef, reducedMotion: false, onAnnounce: announce })
    );

    const handle = result.current.play('confetti', { mode: 'burst' });

    expect(() => handle.stop()).not.toThrow();
    await expect(handle.finished).resolves.toBeUndefined();

    act(() => result.current.stopAll());
    expect(engine.stage.stopAll).not.toHaveBeenCalled();
  });

  it('forwards play and stopAll to the live stage', () => {
    const { hostRef } = host();
    const { result } = renderHook(() =>
      useSpectacleStage({ hostRef, reducedMotion: false, onAnnounce: announce })
    );
    const handle = { finished: Promise.resolve(), stop: vi.fn() };
    engine.stage.play.mockReturnValue(handle);

    const played = result.current.play('confetti', { mode: 'rain' });
    act(() => result.current.stopAll());

    expect(engine.stage.play).toHaveBeenCalledWith('confetti', { mode: 'rain' });
    expect(played).toBe(handle);
    expect(engine.stage.stopAll).toHaveBeenCalledTimes(1);
  });

  it('passes reduced-motion changes down without rebuilding the stage', () => {
    const { hostRef } = host();
    const { rerender } = renderHook(
      ({ reducedMotion }) =>
        useSpectacleStage({ hostRef, reducedMotion, onAnnounce: announce }),
      { initialProps: { reducedMotion: false } }
    );

    rerender({ reducedMotion: true });

    expect(engine.stage.setReducedMotion).toHaveBeenCalledWith(true);
    expect(engine.createSpectacleStage).toHaveBeenCalledTimes(1);
  });

  it('rebuilds the stage when the announcement sink changes', () => {
    const { hostRef } = host();
    const first = vi.fn();
    const { rerender } = renderHook(
      ({ onAnnounce }) => useSpectacleStage({ hostRef, reducedMotion: false, onAnnounce }),
      { initialProps: { onAnnounce: first } }
    );

    rerender({ onAnnounce: announce });

    expect(engine.stage.dispose).toHaveBeenCalledTimes(1);
    expect(engine.createSpectacleStage).toHaveBeenCalledTimes(2);
  });

  it('disposes the stage and forgets its quality on unmount', () => {
    const { hostRef } = host();
    const { result, unmount } = renderHook(() =>
      useSpectacleStage({ hostRef, reducedMotion: false, onAnnounce: announce })
    );
    expect(result.current.isReady).toBe(true);

    unmount();

    expect(engine.stage.dispose).toHaveBeenCalledTimes(1);
  });
});
