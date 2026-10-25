// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The audio engine and the imperative manager need browser audio and WebGL. They are doubled
// at their module seams: what is under test is the wiring, which scene API ends up behind
// the ref, and what is created and released when.
const doubles = vi.hoisted(() => ({
  audio: [] as Array<{ disposed: number; shimmers: number[] }>,
  managers: [] as Array<{ options: unknown; disposed: number }>,
}));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    record = { disposed: 0, shimmers: [] as number[] };
    constructor() {
      doubles.audio.push(this.record);
    }
    triggerActShimmer(index: number) {
      this.record.shimmers.push(index);
    }
    dispose() {
      this.record.disposed += 1;
    }
    toggle() {
      return true;
    }
  },
}));

vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    record: { options: unknown; disposed: number };
    constructor(_container: unknown, options: unknown) {
      this.record = { options, disposed: 0 };
      doubles.managers.push(this.record);
    }
    dispose() {
      this.record.disposed += 1;
    }
  },
}));

import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime, type PremiereRuntime } from './usePremiereRuntime';

afterEach(() => {
  doubles.audio.length = 0;
  doubles.managers.length = 0;
  window.history.replaceState(null, '', '/');
});

function run(search = '', wrapper?: (props: { children: ReactNode }) => ReactNode) {
  window.history.replaceState(null, '', `/${search}`);
  const mountRef = { current: document.createElement('div') };
  const managerRef = { current: null as PremiereSceneApi | null };
  const audioRef = { current: null as CinemaAudioEngine | null };
  const onTelemetry = vi.fn();
  const onChapterChange = vi.fn();
  const view = renderHook(
    () => usePremiereRuntime({ mountRef, managerRef, audioRef, onTelemetry, onChapterChange }),
    wrapper ? { wrapper: wrapper as never } : undefined,
  );
  return { ...view, mountRef, managerRef, audioRef, onTelemetry, onChapterChange };
}

describe('usePremiereRuntime with the default renderer', () => {
  it('builds the imperative manager on the mount element and hands the hooks its API', () => {
    const { managerRef } = run();

    expect(doubles.managers).toHaveLength(1);
    expect(managerRef.current).not.toBeNull();
  });

  it('creates the audio engine and exposes it', () => {
    const { audioRef } = run();

    expect(doubles.audio).toHaveLength(1);
    expect(audioRef.current).not.toBeNull();
  });

  it('shimmers the audio when the manager announces a chapter, and tells React', () => {
    const { onChapterChange } = run();
    const options = doubles.managers[0].options as { onChapterChange: (index: number) => void };

    options.onChapterChange(3);

    expect(onChapterChange).toHaveBeenCalledWith(3);
    expect(doubles.audio[0].shimmers).toEqual([3]);
  });

  it('passes the manager’s telemetry to React', () => {
    const { onTelemetry } = run();
    const options = doubles.managers[0].options as {
      onTelemetry: (telemetry: { currentTime: number }) => void;
    };

    options.onTelemetry({ currentTime: 4 });

    expect(onTelemetry).toHaveBeenCalledWith({ currentTime: 4 });
  });

  it('tears down the manager and the audio, and clears both refs, on unmount', () => {
    const { unmount, managerRef, audioRef } = run();

    unmount();

    expect(doubles.managers[0].disposed).toBe(1);
    expect(doubles.audio[0].disposed).toBe(1);
    expect(managerRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });

  it('builds nothing when there is no mount element yet', () => {
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as CinemaAudioEngine | null };

    renderHook(() =>
      usePremiereRuntime({
        mountRef: { current: null },
        managerRef,
        audioRef,
        onTelemetry: vi.fn(),
        onChapterChange: vi.fn(),
      }),
    );

    expect(doubles.managers).toHaveLength(0);
    expect(doubles.audio).toHaveLength(0);
  });
});

describe('usePremiereRuntime with the R3F port', () => {
  it('opts in with ?renderer=r3f: no manager is built, the store backs the scene API', () => {
    const { managerRef, result } = run('?renderer=r3f');

    expect(doubles.managers).toHaveLength(0);
    expect(managerRef.current).not.toBeNull();
    expect(result.current.renderer).toBe('r3f');
    expect(result.current.store).not.toBeNull();
  });

  it('keeps the default as the manager, with no store', () => {
    const { result } = run();

    expect(result.current.renderer).toBe('manager');
    expect(result.current.store).toBeNull();
  });

  it('drives the store through the scene API the hooks call', () => {
    const { managerRef, result } = run('?renderer=r3f');

    managerRef.current!.setTime(6);
    managerRef.current!.setNitrateMode(true);

    expect(result.current.store!.getState().currentTime).toBe(6);
    expect(result.current.store!.getState().isNitrateForced).toBe(true);
  });

  it('seeds a frozen store from ?freezeAt=', () => {
    const { result } = run('?renderer=r3f&freezeAt=12.5');

    expect(result.current.store!.getState().currentTime).toBe(12.5);
    expect(result.current.store!.getState().isPlaying).toBe(false);
  });

  it('shimmers the audio and tells React through the scene callbacks', () => {
    const { result, onChapterChange, onTelemetry } = run('?renderer=r3f');

    result.current.onSceneChapterChange(2);
    result.current.onSceneTelemetry({ currentTime: 1, activeChapterIndex: 0, isPlaying: true });

    expect(onChapterChange).toHaveBeenCalledWith(2);
    expect(doubles.audio[0].shimmers).toEqual([2]);
    expect(onTelemetry).toHaveBeenCalledTimes(1);
  });

  it('sets the frame-ready flag on the mount element', () => {
    const { result, mountRef } = run('?renderer=r3f');

    result.current.onSceneFrameReady();

    expect(mountRef.current.dataset.frameReady).toBe('true');
  });
});

// The bug only PR #3 found, in a real browser: React StrictMode mounts, disposes and
// remounts every effect in development, and a scene whose dispose() paused the clock came
// back loaded but paused. dispose() here never touches the store, so a live premiere keeps
// playing and a frozen one stays frozen, whichever renderer is behind the ref.
//
// `renderHook`'s wrapper does not double-invoke effects, so these mount a real component
// inside <StrictMode> with `render`, which does (mount, cleanup, mount).
describe('usePremiereRuntime under StrictMode', () => {
  function mountStrict(search: string) {
    window.history.replaceState(null, '', `/${search}`);
    const captured: { runtime: PremiereRuntime | null } = { runtime: null };
    const mountRef = { current: document.createElement('div') };
    const managerRef = { current: null as PremiereSceneApi | null };
    const audioRef = { current: null as CinemaAudioEngine | null };
    function Host() {
      captured.runtime = usePremiereRuntime({
        mountRef,
        managerRef,
        audioRef,
        onTelemetry: vi.fn(),
        onChapterChange: vi.fn(),
      });
      return null;
    }
    act(() => {
      render(
        <StrictMode>
          <Host />
        </StrictMode>,
      );
    });
    return { runtime: captured.runtime!, managerRef };
  }

  it('runs the effect through mount, cleanup, mount (the harness really is strict)', () => {
    mountStrict('?renderer=r3f');

    expect(doubles.audio).toHaveLength(2);
    expect(doubles.audio.filter((audio) => audio.disposed === 1)).toHaveLength(1);
  });

  it('keeps a live R3F premiere playing through the cycle', () => {
    const { runtime } = mountStrict('?renderer=r3f');

    expect(runtime.store!.getState().isPlaying).toBe(true);
  });

  it('keeps a frozen R3F premiere frozen through the same cycle', () => {
    const { runtime } = mountStrict('?renderer=r3f&freezeAt=7');

    expect(runtime.store!.getState().isPlaying).toBe(false);
    expect(runtime.store!.getState().currentTime).toBe(7);
  });

  it('keeps the user’s settings through the cycle', () => {
    const { runtime, managerRef } = mountStrict('?renderer=r3f');

    managerRef.current!.setNitrateMode(true);
    managerRef.current!.dispose();

    expect(runtime.store!.getState().isNitrateForced).toBe(true);
  });

  it('leaves exactly one live audio engine after the cycle', () => {
    mountStrict('?renderer=r3f');

    expect(doubles.audio.filter((audio) => audio.disposed === 0)).toHaveLength(1);
  });

  it('leaves exactly one live manager after the cycle on the default renderer', () => {
    mountStrict('');

    expect(doubles.managers).toHaveLength(2);
    expect(doubles.managers.filter((manager) => manager.disposed === 0)).toHaveLength(1);
  });

  it('creates the store once, so the cycle cannot reset playback', () => {
    const { runtime } = mountStrict('?renderer=r3f');
    runtime.store!.getState().setTime(20);

    expect(runtime.store!.getState().currentTime).toBe(20);
  });

  it('leaves the scene API pointing at a live scene after the cycle', () => {
    const { managerRef } = mountStrict('?renderer=r3f');

    expect(managerRef.current).not.toBeNull();
  });
});
