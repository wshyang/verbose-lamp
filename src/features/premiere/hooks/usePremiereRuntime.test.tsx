// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject, RefObject } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime, type PremiereRuntimeOptions } from './usePremiereRuntime';

const env = vi.hoisted(() => ({
  triggerActShimmer: vi.fn(),
  disposeAudio: vi.fn(),
  audioConstructed: 0,
}));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    constructor() {
      env.audioConstructed += 1;
    }
    triggerActShimmer(chapter: number) {
      env.triggerActShimmer(chapter);
    }
    dispose() {
      env.disposeAudio();
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  env.audioConstructed = 0;
  window.history.replaceState({}, '', '/');
});

function options() {
  const host = document.createElement('div');
  const mountRef: RefObject<HTMLDivElement | null> = { current: host };
  const managerRef: MutableRefObject<PremiereSceneApi | null> = { current: null };
  const audioRef: MutableRefObject<CinemaAudioEngine | null> = { current: null };
  const onTelemetry = vi.fn();
  const onChapterChange = vi.fn();
  return {
    mountRef,
    managerRef,
    audioRef,
    onTelemetry,
    onChapterChange,
  } satisfies PremiereRuntimeOptions;
}

describe('usePremiereRuntime', () => {
  it('creates the store, the audio engine and the scene port for the host', () => {
    const props = options();
    const { result } = renderHook(() => usePremiereRuntime(props));
    expect(env.audioConstructed).toBe(1);
    expect(props.audioRef.current).not.toBeNull();
    expect(props.managerRef.current).not.toBeNull();
    expect(result.current.getState().currentTime).toBe(0);

    // The port is the store, so a transport call lands in scene state.
    act(() => props.managerRef.current?.setTime(11.28));
    expect(result.current.getState().currentTime).toBeCloseTo(11.28);
  });

  it('forwards telemetry and chapter changes to the latest callbacks', () => {
    const first = options();
    const { rerender, result } = renderHook((props) => usePremiereRuntime(props), {
      initialProps: first,
    });
    const second = options();
    rerender(second);

    act(() => result.current.getState().onTelemetry?.({ currentTime: 4, activeChapterIndex: 1, isPlaying: true }));
    expect(first.onTelemetry).not.toHaveBeenCalled();
    expect(second.onTelemetry).toHaveBeenCalledWith({
      currentTime: 4,
      activeChapterIndex: 1,
      isPlaying: true,
    });

    act(() => result.current.getState().onChapterChange?.(3));
    expect(second.onChapterChange).toHaveBeenCalledWith(3);
    expect(env.triggerActShimmer).toHaveBeenCalledWith(3);
  });

  it('flags the mount host ready and tolerates a host that has gone away', () => {
    const props = options();
    const { result } = renderHook(() => usePremiereRuntime(props));

    act(() => result.current.getState().onFrameReady?.());
    expect(props.mountRef.current?.dataset.frameReady).toBe('true');

    props.mountRef.current = null;
    expect(() => result.current.getState().onFrameReady?.()).not.toThrow();
  });

  it('forwards the freeze time from the query string', () => {
    window.history.replaceState({}, '', '/?freezeAt=4.32');
    const { result } = renderHook(() => usePremiereRuntime(options()));
    expect(result.current.getState().freezeAt).toBe(4.32);
    expect(result.current.getState().currentTime).toBe(4.32);
    expect(result.current.getState().isPlaying).toBe(false);
  });

  it('starts unfrozen and playing for a plain visit', () => {
    const { result } = renderHook(() => usePremiereRuntime(options()));
    expect(result.current.getState().freezeAt).toBeNull();
    expect(result.current.getState().isPlaying).toBe(true);
  });

  it('disposes the audio engine on unmount and stops the scene', () => {
    const props = options();
    const { unmount, result } = renderHook(() => usePremiereRuntime(props));
    unmount();
    expect(env.disposeAudio).toHaveBeenCalledTimes(1);
    expect(props.managerRef.current).toBeNull();
    expect(props.audioRef.current).toBeNull();
    expect(result.current.getState().isPlaying).toBe(false);
  });

  it('does nothing until the host element exists', () => {
    const props = options();
    props.mountRef.current = null;
    const { result } = renderHook(() => usePremiereRuntime(props));
    expect(env.audioConstructed).toBe(0);
    expect(props.managerRef.current).toBeNull();
    // The store still exists, so the canvas can mount and wait for the host.
    expect(result.current.getState().isPlaying).toBe(true);
  });
});
