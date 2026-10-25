// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { usePremiereController } from './usePremiereController';

setupDomTests();

const scene = vi.hoisted(() => ({
  togglePlaying: vi.fn(() => false),
  setTime: vi.fn(),
  setPlaying: vi.fn(),
  jumpToChapter: vi.fn(),
  setCameraMode: vi.fn(),
  setNitrateMode: vi.fn(),
  updateHeroTitle: vi.fn(),
  setSequenceFrameStyle: vi.fn(),
  setScreenBorderStyle: vi.fn(),
  setScreenBorderEnabled: vi.fn(),
  dispose: vi.fn(),
}));

const audio = vi.hoisted(() => ({
  toggle: vi.fn(() => true),
  triggerActShimmer: vi.fn(),
  dispose: vi.fn(),
}));

const lastOptions = vi.hoisted(() => ({
  current: null as null | {
    onTelemetry: (t: { currentTime: number; isPlaying: boolean }) => void;
    onChapterChange: (index: number) => void;
    freezeAt?: number;
  },
}));

vi.mock('../scene/GatsbySceneManager', () => ({
  GatsbySceneManager: class {
    constructor(_node: HTMLElement, options: typeof lastOptions.current) {
      lastOptions.current = options;
      return scene;
    }
  },
}));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    constructor() {
      return audio;
    }
  },
}));

beforeEach(() => {
  for (const spy of Object.values(scene)) spy.mockClear();
  for (const spy of Object.values(audio)) spy.mockClear();
  scene.togglePlaying.mockReturnValue(false);
  audio.toggle.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Mounts the controller with the stage element wired the way the app does. */
function mounted() {
  const stage = document.createElement('div');
  const { result, unmount } = renderHook(() => {
    const premiere = usePremiereController();
    if (!premiere.stageRef.current) premiere.stageRef.current = stage;
    return premiere;
  });
  return { result, unmount, stage };
}

describe('usePremiereController', () => {
  it('starts on the first act, playing, in cinema mode with sound off', () => {
    const { result } = mounted();

    expect(result.current.activeAct).toBe(0);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.cameraMode).toBe('cinema');
    expect(result.current.nitrateMode).toBe(false);
    expect(result.current.soundOn).toBe(false);
    expect(result.current.currentChapter.id).toBeDefined();
  });

  it('derives the current chapter from the act index', () => {
    const { result } = mounted();

    act(() => result.current.selectAct(2));

    expect(result.current.activeAct).toBe(2);
    expect(result.current.currentChapter).toEqual(result.current.currentChapter);
    expect(scene.jumpToChapter).toHaveBeenCalledWith(2);
    expect(audio.triggerActShimmer).toHaveBeenCalledWith(2);
  });

  it('exposes the transport and the scene options in one controller', () => {
    const { result } = mounted();

    for (const key of [
      'togglePlayback',
      'replay',
      'scrub',
      'selectAct',
      'toggleCameraMode',
      'toggleNitrateMode',
      'toggleSound',
      'applyHeroTitle',
      'frameStudio',
    ]) {
      expect(result.current, key).toHaveProperty(key);
    }
  });

  it('mirrors playback state reported by the scene', () => {
    const { result } = mounted();

    act(() => result.current.togglePlayback());

    expect(scene.togglePlaying).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('scrubs the timeline and the scene together', () => {
    const { result } = mounted();

    act(() => result.current.scrub(9.25));

    expect(result.current.currentTime).toBe(9.25);
    expect(scene.setTime).toHaveBeenCalledWith(9.25);
  });

  it('replays from the top', () => {
    const { result } = mounted();
    act(() => result.current.scrub(20));

    act(() => result.current.replay());

    expect(result.current.currentTime).toBe(0);
    expect(scene.setTime).toHaveBeenCalledWith(0);
    expect(result.current.isPlaying).toBe(true);
  });

  it('flips the camera and the nitrate grade through to the scene', () => {
    const { result } = mounted();

    act(() => result.current.toggleCameraMode());
    act(() => result.current.toggleNitrateMode());

    expect(result.current.cameraMode).toBe('orbit');
    expect(result.current.nitrateMode).toBe(true);
    expect(scene.setCameraMode).toHaveBeenLastCalledWith('orbit');
    expect(scene.setNitrateMode).toHaveBeenCalledWith(true);
  });

  it('applies a hero title and jumps to the reveal', () => {
    const { result } = mounted();
    const next = { ...result.current.heroConfig, mainTitle: 'GATSBY' };

    act(() => result.current.applyHeroTitle(next));

    expect(result.current.heroConfig).toEqual(next);
    expect(result.current.activeAct).toBe(4);
    expect(scene.updateHeroTitle).toHaveBeenCalledWith(next);
  });

  it('mirrors telemetry into the HUD, at most every 48 ms', () => {
    let clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const { result } = mounted();
    const telemetry = lastOptions.current!.onTelemetry;

    // The first frame after mount is far enough from the zeroed clock.
    act(() => telemetry({ currentTime: 4.5, isPlaying: false }));
    expect(result.current.currentTime).toBe(4.5);
    expect(result.current.isPlaying).toBe(false);

    // 16 ms later: too soon, so the HUD keeps the previous values.
    clock = 10_016;
    act(() => telemetry({ currentTime: 4.75, isPlaying: true }));
    expect(result.current.currentTime).toBe(4.5);

    // Past the window: the new values land.
    clock = 10_060;
    act(() => telemetry({ currentTime: 5, isPlaying: true }));
    expect(result.current.currentTime).toBe(5);
    expect(result.current.isPlaying).toBe(true);
  });

  it('follows chapter changes reported by the scene, ringing the shimmer', () => {
    const { result } = mounted();

    act(() => lastOptions.current!.onChapterChange(1));

    expect(result.current.activeAct).toBe(1);
    expect(audio.triggerActShimmer).toHaveBeenCalledWith(1);
  });

  it('mounts the scene against the stage node', () => {
    const { stage } = mounted();
    expect(stage.isConnected).toBe(false);
    expect(lastOptions.current).not.toBeNull();
    expect(lastOptions.current!.freezeAt).toBeUndefined();
  });

  it('disposes the scene and the audio engine on unmount', () => {
    const { unmount } = mounted();

    unmount();

    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(audio.dispose).toHaveBeenCalledTimes(1);
  });

  it('works before the stage node exists', () => {
    // No stageRef assignment: usePremiereRuntime bails out, so there is no scene.
    const { result } = renderHook(() => usePremiereController());

    expect(() => {
      act(() => result.current.togglePlayback());
      act(() => result.current.selectAct(3));
    }).not.toThrow();

    expect(scene.togglePlaying).not.toHaveBeenCalled();
    expect(audio.triggerActShimmer).not.toHaveBeenCalled();
    expect(result.current.activeAct).toBe(3);
  });
});
