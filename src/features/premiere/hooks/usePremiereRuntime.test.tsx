// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject, RefObject } from 'react';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime, type PremiereRuntimeOptions } from './usePremiereRuntime';

const env = vi.hoisted(() => ({
  telemetry: null as null | ((telemetry: unknown) => void),
  chapter: null as null | ((index: number) => void),
  triggerActShimmer: vi.fn(),
  disposeAudio: vi.fn(),
  disposeScene: vi.fn(),
  audioConstructed: 0,
  sceneConstructed: 0,
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

vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    constructor(
      _host: HTMLElement,
      options: { onTelemetry: (t: unknown) => void; onChapterChange: (i: number) => void },
    ) {
      env.sceneConstructed += 1;
      env.telemetry = options.onTelemetry;
      env.chapter = options.onChapterChange;
    }
    dispose() {
      env.disposeScene();
    }
  },
}));

// Reset before each test: React Testing Library's global cleanup unmounts the
// previous test's hook after this file's own hooks have run.
beforeEach(() => {
  vi.clearAllMocks();
  env.audioConstructed = 0;
  env.sceneConstructed = 0;
});

function options() {
  const host = document.createElement('div');
  const mountRef = { current: host };
  const managerRef: MutableRefObject<PremiereSceneApi | null> = { current: null };
  const audioRef: MutableRefObject<CinemaAudioEngine | null> = { current: null };
  const onTelemetry = vi.fn();
  const onChapterChange = vi.fn();
  return {
    mountRef: mountRef as RefObject<HTMLDivElement | null>,
    managerRef,
    audioRef,
    onTelemetry,
    onChapterChange,
  } satisfies PremiereRuntimeOptions;
}

describe('usePremiereRuntime', () => {
  it('builds the scene and the audio engine for the mount host', () => {
    const props = options();
    renderHook(() => usePremiereRuntime(props));
    expect(env.sceneConstructed).toBe(1);
    expect(env.audioConstructed).toBe(1);
    expect(props.managerRef.current).not.toBeNull();
    expect(props.audioRef.current).not.toBeNull();
  });

  it('forwards telemetry and chapter changes to the latest callbacks', () => {
    const first = options();
    const { rerender } = renderHook((props) => usePremiereRuntime(props), {
      initialProps: first,
    });
    const second = options();
    rerender(second);

    env.telemetry?.({ chapterIndex: 2, elapsed: 4.5 });
    expect(first.onTelemetry).not.toHaveBeenCalled();
    expect(second.onTelemetry).toHaveBeenCalledWith({ chapterIndex: 2, elapsed: 4.5 });

    env.chapter?.(3);
    expect(second.onChapterChange).toHaveBeenCalledWith(3);
    expect(env.triggerActShimmer).toHaveBeenCalledWith(3);
  });

  it('disposes both engines on unmount', () => {
    const props = options();
    const { unmount } = renderHook(() => usePremiereRuntime(props));
    unmount();
    expect(env.disposeScene).toHaveBeenCalledTimes(1);
    expect(env.disposeAudio).toHaveBeenCalledTimes(1);
    expect(props.managerRef.current).toBeNull();
    expect(props.audioRef.current).toBeNull();
  });

  it('does nothing until the host element exists', () => {
    const props = options();
    props.mountRef.current = null as unknown as HTMLDivElement;
    renderHook(() => usePremiereRuntime(props));
    expect(env.sceneConstructed).toBe(0);
    expect(env.audioConstructed).toBe(0);
  });
});
