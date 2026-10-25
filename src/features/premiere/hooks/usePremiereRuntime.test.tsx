// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime } from './usePremiereRuntime';

const sceneManager = vi.hoisted(() => ({
  instances: [] as Array<{ container: HTMLElement; options: Record<string, unknown>; dispose: () => void }>,
}));

vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    dispose = vi.fn();
    constructor(container: HTMLElement, options: Record<string, unknown>) {
      sceneManager.instances.push({ container, options, dispose: this.dispose });
    }
  },
}));

function makeCallbacks() {
  return { onTelemetry: vi.fn<(t: PlaybackTelemetry) => void>(), onChapterChange: vi.fn<(i: number) => void>() };
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}

describe('usePremiereRuntime', () => {
  beforeEach(() => {
    sceneManager.instances = [];
    setSearch('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSearch('');
  });

  /**
   * The ref must hold the container *before* the hook mounts: its effect reads
   * `mountRef.current` once, exactly like the stage div in the app.
   */
  function renderRuntime({ withContainer = true } = {}) {
    const element = document.createElement('div');
    if (withContainer) document.body.appendChild(element);
    const mountRef = { current: withContainer ? element : null };
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as CinemaAudioEngine | null };
    const callbacks = makeCallbacks();
    const hook = renderHook(() => usePremiereRuntime({ mountRef, managerRef, audioRef, ...callbacks }));
    return { element, mountRef, managerRef, audioRef, callbacks, hook };
  }

  it('defaults to the React renderer and exposes a store-backed scene API', () => {
    const { hook, managerRef } = renderRuntime();
    expect(hook.result.current.renderer).toBe('r3f');
    expect(hook.result.current.store).not.toBeNull();
    expect(managerRef.current).not.toBeNull();
    expect(sceneManager.instances).toHaveLength(0);
  });

  it('passes ?freezeAt into the store', () => {
    setSearch('?freezeAt=12.5');
    const { hook } = renderRuntime();
    expect(hook.result.current.store?.getState().freezeAt).toBe(12.5);
  });

  it('mounts the classic manager when the URL asks for it', () => {
    setSearch('?renderer=classic&freezeAt=3');
    const { hook, managerRef, callbacks, element } = renderRuntime();

    expect(hook.result.current.renderer).toBe('classic');
    expect(hook.result.current.store).toBeNull();
    expect(sceneManager.instances).toHaveLength(1);
    const [instance] = sceneManager.instances;
    expect(instance.container).toBe(element);
    expect(instance.options.freezeAt).toBe(3);

    const telemetry = { activeChapterIndex: 1, currentTime: 4, isPlaying: true };
    (instance.options.onTelemetry as (t: PlaybackTelemetry) => void)(telemetry);
    expect(callbacks.onTelemetry).toHaveBeenCalledWith(telemetry);
    (instance.options.onChapterChange as (i: number) => void)(2);
    expect(callbacks.onChapterChange).toHaveBeenCalledWith(2);
    expect(managerRef.current).not.toBeNull();

    hook.unmount();
    expect(instance.dispose).toHaveBeenCalled();
    expect(managerRef.current).toBeNull();
    expect(document.body.contains(element)).toBe(true);
  });

  it('clears the manager and audio refs when the React renderer unmounts', () => {
    const { hook, managerRef, audioRef } = renderRuntime();
    expect(audioRef.current).not.toBeNull();
    hook.unmount();
    expect(managerRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });

  it('does nothing when there is no container to mount into', () => {
    setSearch('?renderer=classic');
    const { hook } = renderRuntime({ withContainer: false });
    expect(hook.result.current.renderer).toBe('classic');
    expect(sceneManager.instances).toHaveLength(0);
  });

  it('marks the container frame-ready and shimmers on chapter changes', () => {
    const { hook, audioRef, element } = renderRuntime();
    const shimmer = vi.spyOn(audioRef.current as unknown as { triggerActShimmer: (i: number) => void }, 'triggerActShimmer');

    act(() => hook.result.current.sceneCallbacks.onFrameReady());
    expect(element.dataset.frameReady).toBe('true');

    act(() => hook.result.current.sceneCallbacks.onChapterChange(3));
    expect(shimmer).toHaveBeenCalledWith(3);
  });

  it('forwards telemetry through the live callback ref', () => {
    const mountRef = { current: document.createElement('div') };
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as CinemaAudioEngine | null };
    const first = makeCallbacks();
    const second = makeCallbacks();
    const { result, rerender } = renderHook(
      (props: { onTelemetry: (t: PlaybackTelemetry) => void; onChapterChange: (i: number) => void }) =>
        usePremiereRuntime({ mountRef, managerRef, audioRef, ...props }),
      { initialProps: first }
    );
    rerender(second);
    const telemetry = { activeChapterIndex: 1, currentTime: 9, isPlaying: false };
    result.current.sceneCallbacks.onTelemetry(telemetry);
    expect(first.onTelemetry).not.toHaveBeenCalled();
    expect(second.onTelemetry).toHaveBeenCalledWith(telemetry);
  });

  it('mounts the classic renderer without a freeze point', () => {
    setSearch('?renderer=classic');
    const { hook } = renderRuntime();
    expect(hook.result.current.renderer).toBe('classic');
    expect(sceneManager.instances).toHaveLength(1);
    expect(sceneManager.instances[0].options.freezeAt).toBeUndefined();
  });

  it('tolerates a frame-ready call before the container exists', () => {
    const { hook } = renderRuntime({ withContainer: false });
    expect(() => hook.result.current.sceneCallbacks.onFrameReady()).not.toThrow();
  });
});
