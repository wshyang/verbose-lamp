// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { usePremiereController } from './usePremiereController';
import { type PlaybackTelemetry } from '../scene/sceneApi';

const runtimeArgs = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  sceneTargets: [] as Array<() => unknown>,
}));
vi.mock('./usePremiereRuntime', () => ({
  usePremiereRuntime: (options: Record<string, unknown>) => {
    runtimeArgs.calls.push(options);
    return { renderer: 'r3f' as const, store: null, sceneCallbacks: {} };
  },
}));
vi.mock('@/features/frame-studio', () => ({
  useFrameStudio: (getTarget: () => unknown) => {
    runtimeArgs.sceneTargets.push(getTarget);
    return { isOpen: true, close: vi.fn() };
  },
}));
describe('usePremiereController', () => {
  beforeEach(() => {
    runtimeArgs.calls = [];
    runtimeArgs.sceneTargets = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on the first act, playing, in cinema mode with the default hero title', () => {
    const { result } = renderHook(() => usePremiereController());
    expect(result.current.currentTime).toBe(0);
    expect(result.current.activeAct).toBe(0);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.cameraMode).toBe('cinema');
    expect(result.current.nitrateMode).toBe(false);
    expect(result.current.soundOn).toBe(false);
    expect(result.current.currentChapter).toBe(SEQUENCE_CHAPTERS[0]);
    expect(result.current.frameStudio).toEqual({ isOpen: true, close: expect.any(Function) });
    expect(result.current.stageRef.current).toBeNull();
    // The transport and scene-option callbacks are all surfaced to the view.
    for (const key of ['togglePlayback', 'replay', 'scrub', 'selectAct', 'toggleCameraMode', 'toggleNitrateMode', 'toggleSound', 'applyHeroTitle']) {
      expect(typeof result.current[key as keyof typeof result.current]).toBe('function');
    }
  });

  it('throttles telemetry-driven UI updates to one per 48 ms', () => {
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    const { result } = renderHook(() => usePremiereController());
    const onTelemetry = runtimeArgs.calls[0].onTelemetry as (t: PlaybackTelemetry) => void;

    act(() => onTelemetry({ activeChapterIndex: 0, currentTime: 1.5, isPlaying: true }));
    expect(result.current.currentTime).toBe(1.5);

    nowMs = 1_030; // inside the 48 ms window: the frame is skipped
    act(() => onTelemetry({ activeChapterIndex: 0, currentTime: 9, isPlaying: false }));
    expect(result.current.currentTime).toBe(1.5);
    expect(result.current.isPlaying).toBe(true);

    nowMs = 1_060;
    act(() => onTelemetry({ activeChapterIndex: 0, currentTime: 2, isPlaying: false }));
    expect(result.current.currentTime).toBe(2);
    expect(result.current.isPlaying).toBe(false);
  });

  it('gives the frame studio a getter for the live scene manager', () => {
    renderHook(() => usePremiereController());
    const getTarget = runtimeArgs.sceneTargets[0];
    // Nothing is mounted in this test, so the getter reports honestly that there
    // is no scene to style yet, rather than handing out a stale manager.
    expect(getTarget()).toBeNull();
    expect(getTarget).toBeTypeOf('function');
  });

  it('hands the runtime live refs and stable callbacks', () => {
    const { result, rerender } = renderHook(() => usePremiereController());
    const first = runtimeArgs.calls[0];
    rerender();
    const second = runtimeArgs.calls[1];
    expect(first.mountRef).toBe(result.current.stageRef);
    expect(first.onTelemetry).toBe(second.onTelemetry);
    expect(first.onChapterChange).toBe(second.onChapterChange);
  });
});
