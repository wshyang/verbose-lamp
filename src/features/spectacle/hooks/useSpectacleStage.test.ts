// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpectacleStage } from './useSpectacleStage';

const mocks = vi.hoisted(() => {
  const handle = { finished: Promise.resolve(), stop: vi.fn() };
  const stage = {
    qualityTier: 'low' as const,
    play: vi.fn(() => handle),
    stopAll: vi.fn(),
    setReducedMotion: vi.fn(),
    dispose: vi.fn(),
  };
  return { handle, stage, create: vi.fn(() => stage) };
});

vi.mock('../engine/createSpectacleStage', () => ({ createSpectacleStage: mocks.create }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReturnValue(mocks.stage);
  mocks.stage.play.mockReturnValue(mocks.handle);
});

describe('useSpectacleStage', () => {
  it('is a safe no-op until a host exists', async () => {
    const hostRef = createRef<HTMLDivElement>();
    const { result } = renderHook(() => useSpectacleStage({
      hostRef, reducedMotion: false, onAnnounce: vi.fn(),
    }));
    expect(result.current).toMatchObject({ qualityTier: null, isReady: false });
    const handle = result.current.play('flash', {});
    await expect(handle.finished).resolves.toBeUndefined();
    expect(() => handle.stop()).not.toThrow();
    act(() => result.current.stopAll());
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates, syncs, proxies, and disposes a stage for a host', () => {
    const hostRef = createRef<HTMLDivElement>();
    hostRef.current = document.createElement('div');
    const onAnnounce = vi.fn();
    const props = { hostRef, reducedMotion: true, onAnnounce };
    const { result, rerender, unmount } = renderHook(
      (p: typeof props) => useSpectacleStage(p),
      { initialProps: props }
    );
    expect(mocks.create).toHaveBeenCalledWith({ host: hostRef.current, onAnnounce, reducedMotion: true });
    expect(result.current).toMatchObject({ qualityTier: 'low', isReady: true });
    expect(result.current.play('flash', { durationMs: 3 })).toBe(mocks.handle);
    act(() => result.current.stopAll());
    rerender({ ...props, reducedMotion: false });
    expect(mocks.stage.setReducedMotion).toHaveBeenLastCalledWith(false);
    unmount();
    expect(mocks.stage.dispose).toHaveBeenCalledOnce();
  });
});
