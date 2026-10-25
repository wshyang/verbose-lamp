// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The audio engine needs browser audio, so it is doubled at its module seam. What is under
// test is the wiring: which scene API ends up behind the ref, what the store is seeded with,
// and what is created and released when.
const doubles = vi.hoisted(() => ({
  audio: [] as Array<{ disposed: number; shimmers: number[] }>,
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

import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereRuntime, type PremiereRuntime } from './usePremiereRuntime';

afterEach(() => {
  doubles.audio.length = 0;
  window.history.replaceState(null, '', '/');
});

function options(hasMount = true) {
  return {
    mountRef: { current: hasMount ? document.createElement('div') : null },
    managerRef: { current: null as PremiereSceneApi | null },
    audioRef: { current: null as CinemaAudioEngine | null },
    onTelemetry: vi.fn(),
    onChapterChange: vi.fn(),
  };
}

function run(search = '', hasMount = true) {
  window.history.replaceState(null, '', `/${search}`);
  const opts = options(hasMount);
  const view = renderHook(() => usePremiereRuntime(opts));
  return { ...view, ...opts };
}

describe('usePremiereRuntime', () => {
  it('backs the scene API with the store', () => {
    const { managerRef, result } = run();

    managerRef.current!.setTime(6);
    managerRef.current!.setNitrateMode(true);

    expect(result.current.store.getState().currentTime).toBe(6);
    expect(result.current.store.getState().isNitrateForced).toBe(true);
  });

  it('starts a plain visit playing from the top', () => {
    const { result } = run();

    expect(result.current.store.getState().isPlaying).toBe(true);
    expect(result.current.store.getState().currentTime).toBe(0);
    expect(result.current.store.getState().freezeAt).toBeNull();
  });

  it('seeds a frozen store from ?freezeAt=', () => {
    const { result } = run('?freezeAt=12.5');

    expect(result.current.store.getState().currentTime).toBe(12.5);
    expect(result.current.store.getState().isPlaying).toBe(false);
  });

  it('ignores a malformed ?freezeAt= and plays', () => {
    const { result } = run('?freezeAt=abc');

    expect(result.current.store.getState().freezeAt).toBeNull();
    expect(result.current.store.getState().isPlaying).toBe(true);
  });

  it('creates the audio engine and exposes it', () => {
    const { audioRef } = run();

    expect(doubles.audio).toHaveLength(1);
    expect(audioRef.current).not.toBeNull();
  });

  it('builds nothing until there is a mount element', () => {
    const { managerRef, audioRef } = run('', false);

    expect(doubles.audio).toHaveLength(0);
    expect(managerRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });

  it('releases the audio and clears both refs on unmount', () => {
    const { unmount, managerRef, audioRef } = run();

    unmount();

    expect(doubles.audio[0].disposed).toBe(1);
    expect(managerRef.current).toBeNull();
    expect(audioRef.current).toBeNull();
  });

  it('shimmers the audio and tells React on a chapter change', () => {
    const { result, onChapterChange } = run();

    result.current.onSceneChapterChange(2);

    expect(onChapterChange).toHaveBeenCalledWith(2);
    expect(doubles.audio[0].shimmers).toEqual([2]);
  });

  it('passes telemetry to React', () => {
    const { result, onTelemetry } = run();

    result.current.onSceneTelemetry({ currentTime: 1, activeChapterIndex: 0, isPlaying: true });

    expect(onTelemetry).toHaveBeenCalledWith({ currentTime: 1, activeChapterIndex: 0, isPlaying: true });
  });

  it('sets the frame-ready flag on the mount element', () => {
    const { result, mountRef } = run();

    result.current.onSceneFrameReady();

    expect(mountRef.current!.dataset.frameReady).toBe('true');
  });

  it('does nothing when frame-ready fires before there is a mount element', () => {
    const { result } = run('', false);

    expect(() => result.current.onSceneFrameReady()).not.toThrow();
  });

  it('keeps the latest React callbacks without re-subscribing', () => {
    window.history.replaceState(null, '', '/');
    const opts = options();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onTelemetry }) => usePremiereRuntime({ ...opts, onTelemetry }),
      { initialProps: { onTelemetry: first } },
    );

    rerender({ onTelemetry: second });
    result.current.onSceneTelemetry({ currentTime: 2, activeChapterIndex: 0, isPlaying: true });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

// The bug only PR #3 found, in a real browser: React StrictMode mounts, disposes and
// remounts every effect in development, and a scene whose dispose() paused the clock came
// back loaded but paused. dispose() here never touches the store, so a live premiere keeps
// playing and a frozen one stays frozen.
//
// `renderHook`'s wrapper does not double-invoke effects, so these mount a real component
// inside <StrictMode> with `render`, which does (mount, cleanup, mount).
describe('usePremiereRuntime under StrictMode', () => {
  function mountStrict(search: string) {
    window.history.replaceState(null, '', `/${search}`);
    const captured: { runtime: PremiereRuntime | null } = { runtime: null };
    const opts = options();
    function Host() {
      captured.runtime = usePremiereRuntime(opts);
      return null;
    }
    act(() => {
      render(
        <StrictMode>
          <Host />
        </StrictMode>,
      );
    });
    return { runtime: captured.runtime!, managerRef: opts.managerRef };
  }

  it('runs the effect through mount, cleanup, mount (the harness really is strict)', () => {
    mountStrict('');

    expect(doubles.audio).toHaveLength(2);
    expect(doubles.audio.filter((audio) => audio.disposed === 1)).toHaveLength(1);
  });

  it('keeps a live premiere playing through the cycle', () => {
    const { runtime } = mountStrict('');

    expect(runtime.store.getState().isPlaying).toBe(true);
  });

  it('keeps a frozen premiere frozen through the same cycle', () => {
    const { runtime } = mountStrict('?freezeAt=7');

    expect(runtime.store.getState().isPlaying).toBe(false);
    expect(runtime.store.getState().currentTime).toBe(7);
  });

  it('keeps the user’s settings through the cycle', () => {
    const { runtime, managerRef } = mountStrict('');

    managerRef.current!.setNitrateMode(true);
    managerRef.current!.dispose();

    expect(runtime.store.getState().isNitrateForced).toBe(true);
  });

  it('leaves exactly one live audio engine after the cycle', () => {
    mountStrict('');

    expect(doubles.audio.filter((audio) => audio.disposed === 0)).toHaveLength(1);
  });

  it('creates the store once, so the cycle cannot reset playback', () => {
    const { runtime } = mountStrict('');
    runtime.store.getState().setTime(20);

    expect(runtime.store.getState().currentTime).toBe(20);
  });

  it('leaves the scene API pointing at a live scene after the cycle', () => {
    const { managerRef } = mountStrict('');

    expect(managerRef.current).not.toBeNull();
  });
});
