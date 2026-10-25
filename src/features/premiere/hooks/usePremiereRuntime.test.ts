// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { createPremiereStore } from '../scene3d/premiereStore';
import { usePremiereRuntime } from './usePremiereRuntime';

setupDomTests();

const state = vi.hoisted(() => ({
  scenes: [] as Array<{ container: unknown; options: Record<string, unknown>; dispose: ReturnType<typeof vi.fn> }>,
  audios: [] as Array<{ shimmer: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    dispose = vi.fn();

    constructor(container: unknown, options: Record<string, unknown>) {
      state.scenes.push({ container, options, dispose: this.dispose });
    }
  },
}));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    shimmer = vi.fn();
    dispose = vi.fn();

    constructor() {
      state.audios.push({ shimmer: this.shimmer, dispose: this.dispose });
    }

    triggerActShimmer(index: number) {
      this.shimmer(index);
    }
  },
}));

afterEach(() => {
  state.scenes.length = 0;
  state.audios.length = 0;
  window.history.replaceState({}, '', '/');
});

function mount({ container = document.createElement('div') as HTMLDivElement | null } = {}) {
  const mountRef = { current: container };
  const managerRef = { current: null as PremiereSceneApi | null };
  const audioRef = { current: null as unknown as import('../audio/cinemaAudio').CinemaAudioEngine | null };
  const onTelemetry = vi.fn();
  const onChapterChange = vi.fn();
  const { result, unmount } = renderHook(() =>
    usePremiereRuntime({ mountRef, managerRef, audioRef, onTelemetry, onChapterChange }),
  );
  return { result, unmount, managerRef, audioRef, onTelemetry, onChapterChange };
}

describe('usePremiereRuntime', () => {
  it('builds the scene and audio engine on mount', () => {
    const container = document.createElement('div');
    const { managerRef, audioRef } = mount({ container });

    expect(state.scenes).toHaveLength(1);
    expect(state.scenes[0].container).toBe(container);
    expect(state.audios).toHaveLength(1);
    expect(managerRef.current).toBeTruthy();
    expect(audioRef.current).toBeTruthy();
  });

  it('passes the freeze time from the query string', () => {
    window.history.replaceState({}, '', '/?freezeAt=8.5');
    mount();

    expect(state.scenes[0].options.freezeAt).toBe(8.5);
  });

  it('leaves the scene live when there is no freeze parameter', () => {
    mount();
    expect(state.scenes[0].options.freezeAt).toBeUndefined();
  });

  it('forwards telemetry and chapter changes, ringing the shimmer', () => {
    const { onTelemetry, onChapterChange } = mount();
    const options = state.scenes[0].options as {
      onTelemetry: (t: { currentTime: number; isPlaying: boolean }) => void;
      onChapterChange: (index: number) => void;
    };

    options.onTelemetry({ currentTime: 4, isPlaying: true });
    options.onChapterChange(2);

    expect(onTelemetry).toHaveBeenCalledWith({ currentTime: 4, isPlaying: true });
    expect(onChapterChange).toHaveBeenCalledWith(2);
    expect(state.audios[0].shimmer).toHaveBeenCalledWith(2);
  });

  it('keeps forwarding to the newest callbacks without rebuilding the scene', () => {
    const second = vi.fn();
    const container = document.createElement('div');
    const mountRef = { current: container };
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as unknown as import('../audio/cinemaAudio').CinemaAudioEngine | null };
    const first = vi.fn();

    const { rerender } = renderHook(
      ({ onTelemetry }: { onTelemetry: (t: { currentTime: number; isPlaying: boolean }) => void }) =>
        usePremiereRuntime({ mountRef, managerRef, audioRef, onTelemetry, onChapterChange: vi.fn() }),
      { initialProps: { onTelemetry: first } },
    );
    rerender({ onTelemetry: second });

    const options = state.scenes[0].options as { onTelemetry: (t: unknown) => void };
    options.onTelemetry({ currentTime: 1, isPlaying: false });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ currentTime: 1, isPlaying: false });
    expect(state.scenes).toHaveLength(1);
  });

  it('disposes both engines and clears the refs on unmount', () => {
    const { unmount, managerRef, audioRef } = mount();

    unmount();

    expect(state.scenes[0].dispose).toHaveBeenCalledTimes(1);
    expect(state.audios[0].dispose).toHaveBeenCalledTimes(1);
    expect(managerRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });

  it('does nothing without a mount node', () => {
    mount({ container: null });

    expect(state.scenes).toHaveLength(0);
    expect(state.audios).toHaveLength(0);
  });
  it('hands the store-backed scene API out instead of building a manager', () => {
    const store = createPremiereStore({ freezeAt: 6 });
    const container = document.createElement('div');
    const mountRef = { current: container };
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as unknown as import('../audio/cinemaAudio').CinemaAudioEngine | null };

    const { unmount } = renderHook(() =>
      usePremiereRuntime({ mountRef, managerRef, audioRef, onTelemetry: vi.fn(), onChapterChange: vi.fn(), store }),
    );

    expect(state.scenes).toHaveLength(0);
    expect(state.audios).toHaveLength(1);
    expect(managerRef.current).toBeTruthy();
    managerRef.current?.setTime(9.5);
    expect(store.getState().currentTime).toBeCloseTo(9.5, 9);

    unmount();

    expect(state.audios[0].dispose).toHaveBeenCalledTimes(1);
    expect(managerRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });
});
