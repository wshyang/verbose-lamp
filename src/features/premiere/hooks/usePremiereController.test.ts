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
      'getSceneApi',
    ]) {
      expect(result.current, key).toHaveProperty(key);
    }
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
