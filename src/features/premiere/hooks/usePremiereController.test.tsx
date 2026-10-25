// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_HERO_TITLE } from '../data/sequence';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereController } from './usePremiereController';

const runtime = vi.hoisted(() => ({
  options: null as null | {
    managerRef: { current: PremiereSceneApi | null };
    audioRef: { current: { triggerActShimmer: (index: number) => void; toggle: () => boolean } | null };
    onTelemetry: (telemetry: { currentTime: number; isPlaying: boolean }) => void;
    onChapterChange: (index: number) => void;
  },
}));

vi.mock('./usePremiereRuntime', () => ({
  usePremiereRuntime: (options: typeof runtime.options) => {
    runtime.options = options;
  },
}));

type FakeScene = { [K in keyof PremiereSceneApi]: ReturnType<typeof vi.fn> };

function createScene(): FakeScene {
  return {
    updateHeroTitle: vi.fn(),
    jumpToChapter: vi.fn(),
    setTime: vi.fn(),
    setPlaying: vi.fn(),
    togglePlaying: vi.fn(() => true),
    setCameraMode: vi.fn(),
    setNitrateMode: vi.fn(),
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
    dispose: vi.fn(),
  };
}

function attachScene(scene: PremiereSceneApi) {
  if (!runtime.options) throw new Error('runtime not mounted');
  runtime.options.managerRef.current = scene;
}

beforeEach(() => {
  runtime.options = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePremiereController', () => {
  it('starts at the opening act with the default hero title', () => {
    const { result } = renderHook(() => usePremiereController());
    expect(result.current.currentTime).toBe(0);
    expect(result.current.activeAct).toBe(0);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.cameraMode).toBe('cinema');
    expect(result.current.nitrateMode).toBe(false);
    expect(result.current.soundOn).toBe(false);
    expect(result.current.heroConfig).toEqual(DEFAULT_HERO_TITLE);
    expect(result.current.currentChapter.id).toBe('monogram');
  });

  it('throttles telemetry into React state and tracks chapter changes', () => {
    const { result } = renderHook(() => usePremiereController());
    const options = runtime.options!;

    act(() => options.onTelemetry({ currentTime: 1.5, isPlaying: false }));
    expect(result.current.currentTime).toBe(1.5);
    expect(result.current.isPlaying).toBe(false);

    act(() => options.onTelemetry({ currentTime: 2.5, isPlaying: true }));
    expect(result.current.currentTime).toBe(1.5);

    act(() => options.onChapterChange(2));
    expect(result.current.activeAct).toBe(2);
    expect(result.current.currentChapter.id).toBe('ensemble');
  });

  it('falls back to the opening chapter when the act index runs past the sequence', () => {
    const { result } = renderHook(() => usePremiereController());
    act(() => runtime.options!.onChapterChange(99));
    expect(result.current.activeAct).toBe(99);
    expect(result.current.currentChapter.id).toBe('monogram');
  });

  it('syncs telemetry again once the throttle window has passed', () => {
    const { result } = renderHook(() => usePremiereController());
    const options = runtime.options!;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    act(() => options.onTelemetry({ currentTime: 4, isPlaying: true }));
    now += 60;
    act(() => options.onTelemetry({ currentTime: 6, isPlaying: false }));
    expect(result.current.currentTime).toBe(6);
    expect(result.current.isPlaying).toBe(false);
  });

  it('drives playback, replay, scrubbing and act selection through the scene API', () => {
    const { result } = renderHook(() => usePremiereController());
    const scene = createScene();
    attachScene(scene as unknown as PremiereSceneApi);

    act(() => result.current.togglePlayback());
    expect(scene.togglePlaying).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.scrub(12));
    expect(scene.setTime).toHaveBeenCalledWith(12);
    expect(result.current.currentTime).toBe(12);

    act(() => result.current.selectAct(3));
    expect(scene.jumpToChapter).toHaveBeenCalledWith(3);
    expect(result.current.activeAct).toBe(3);

    act(() => result.current.replay());
    expect(scene.setTime).toHaveBeenCalledWith(0);
    expect(scene.setPlaying).toHaveBeenCalledWith(true);
    expect(result.current.currentTime).toBe(0);
  });

  it('leaves orbit mode when replaying from an orbit camera', () => {
    const { result } = renderHook(() => usePremiereController());
    const scene = createScene();
    attachScene(scene as unknown as PremiereSceneApi);

    act(() => result.current.toggleCameraMode());
    expect(result.current.cameraMode).toBe('orbit');
    expect(scene.setCameraMode).toHaveBeenLastCalledWith('orbit');

    act(() => result.current.replay());
    expect(result.current.cameraMode).toBe('cinema');
    expect(scene.setCameraMode).toHaveBeenLastCalledWith('cinema');
  });

  it('returns to the cinema camera on a second toggle', () => {
    const { result } = renderHook(() => usePremiereController());
    const scene = createScene();
    attachScene(scene as unknown as PremiereSceneApi);
    act(() => result.current.toggleCameraMode());
    expect(result.current.cameraMode).toBe('orbit');
    act(() => result.current.toggleCameraMode());
    expect(result.current.cameraMode).toBe('cinema');
    expect(scene.setCameraMode).toHaveBeenLastCalledWith('cinema');
  });

  it('toggles nitrate and routes the frame studio to the scene', () => {
    const { result } = renderHook(() => usePremiereController());
    const scene = createScene();
    attachScene(scene as unknown as PremiereSceneApi);

    act(() => result.current.toggleNitrateMode());
    expect(result.current.nitrateMode).toBe(true);
    expect(scene.setNitrateMode).toHaveBeenCalledWith(true);

    act(() => result.current.frameStudio.setSurface('screen-border'));
    expect(scene.setScreenBorderEnabled).toHaveBeenCalledWith(true);

    act(() => result.current.frameStudio.setDetail(40));
    expect(scene.setSequenceFrameStyle).toHaveBeenCalled();
  });

  it('applies a custom hero title and jumps to the hero act', () => {
    const { result } = renderHook(() => usePremiereController());
    const scene = createScene();
    attachScene(scene as unknown as PremiereSceneApi);
    const nextTitle = { ...DEFAULT_HERO_TITLE, mainTitle: 'CARRAWAY' };

    act(() => result.current.applyHeroTitle(nextTitle));
    expect(scene.updateHeroTitle).toHaveBeenCalledWith(nextTitle);
    expect(scene.jumpToChapter).toHaveBeenCalledWith(4);
    expect(scene.setPlaying).toHaveBeenCalledWith(true);
    expect(result.current.heroConfig).toEqual(nextTitle);
    expect(result.current.activeAct).toBe(4);
  });

  it('returns to the cinema camera when a title is applied during orbit', () => {
    const { result } = renderHook(() => usePremiereController());
    const scene = createScene();
    attachScene(scene as unknown as PremiereSceneApi);

    act(() => result.current.toggleCameraMode());
    act(() => result.current.applyHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'DAISY' }));
    expect(scene.setCameraMode).toHaveBeenLastCalledWith('cinema');
    expect(result.current.cameraMode).toBe('cinema');
  });

  it('toggles sound through the audio engine and shimmers on act selection', () => {
    const { result } = renderHook(() => usePremiereController());
    const audio = { triggerActShimmer: vi.fn(), toggle: vi.fn(() => true) };
    runtime.options!.audioRef.current = audio;

    act(() => result.current.toggleSound());
    expect(audio.toggle).toHaveBeenCalledTimes(1);
    expect(result.current.soundOn).toBe(true);

    act(() => result.current.selectAct(1));
    expect(audio.triggerActShimmer).toHaveBeenCalledWith(1);
  });

  it('does nothing when the scene or audio engine is not ready yet', () => {
    const { result } = renderHook(() => usePremiereController());
    runtime.options!.managerRef.current = null;
    runtime.options!.audioRef.current = null;

    expect(() => {
      act(() => result.current.togglePlayback());
      act(() => result.current.replay());
      act(() => result.current.selectAct(2));
      act(() => result.current.toggleCameraMode());
      act(() => result.current.toggleNitrateMode());
      act(() => result.current.toggleSound());
      act(() => result.current.applyHeroTitle(DEFAULT_HERO_TITLE));
      act(() => result.current.frameStudio.dismiss());
    }).not.toThrow();
    expect(result.current.currentTime).toBe(0);
  });
});
