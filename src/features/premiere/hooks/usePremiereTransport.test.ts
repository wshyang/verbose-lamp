// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import type { CinemaAudioEngine } from '../audio/cinemaAudio';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { DEFAULT_HERO_TITLE } from '../data/sequence';
import { stubAudio, stubScene } from '../testing/stubScene';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereTransport } from './usePremiereTransport';

setupDomTests();

function transportHarness({ cameraMode = 'cinema', audio = stubAudio() }: { cameraMode?: CameraMode; audio?: ReturnType<typeof stubAudio> } = {}) {
  const scene = stubScene();
  const managerRef = { current: scene as unknown as PremiereSceneApi };
  const audioRef = { current: audio as unknown as CinemaAudioEngine };
  const setters = {
    setCameraMode: vi.fn(),
    setCurrentTime: vi.fn(),
    setActiveAct: vi.fn(),
    setIsPlaying: vi.fn(),
  };
  const { result } = renderHook(() =>
    usePremiereTransport({ managerRef, audioRef, cameraMode, ...setters }),
  );
  return { result, scene, setters, audio };
}

describe('usePremiereTransport', () => {
  it('toggles playback and mirrors the state the scene reports', () => {
    const { result, scene, setters } = transportHarness();
    scene.togglePlaying.mockReturnValue(false);

    result.current.togglePlayback();

    expect(scene.togglePlaying).toHaveBeenCalledTimes(1);
    expect(setters.setIsPlaying).toHaveBeenCalledWith(false);
  });

  it('does nothing without a scene', () => {
    const setters = {
      setCameraMode: vi.fn(),
      setCurrentTime: vi.fn(),
      setActiveAct: vi.fn(),
      setIsPlaying: vi.fn(),
    };
    const { result } = renderHook(() =>
      usePremiereTransport({
        managerRef: { current: null },
        audioRef: { current: null },
        cameraMode: 'cinema',
        ...setters,
      }),
    );

    expect(() => result.current.togglePlayback()).not.toThrow();
    expect(() => result.current.replay()).not.toThrow();
    expect(setters.setIsPlaying).not.toHaveBeenCalled();
  });

  it('replays from the top and drops out of orbit first', () => {
    const { result, scene, setters } = transportHarness({ cameraMode: 'orbit' });

    result.current.replay();

    expect(setters.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(scene.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(scene.setTime).toHaveBeenCalledWith(0);
    expect(scene.setPlaying).toHaveBeenCalledWith(true);
    expect(setters.setCurrentTime).toHaveBeenCalledWith(0);
    expect(setters.setIsPlaying).toHaveBeenCalledWith(true);
  });

  it('replays without touching the camera when already in cinema mode', () => {
    const { result, setters } = transportHarness();

    result.current.replay();

    expect(setters.setCameraMode).not.toHaveBeenCalled();
  });

  it('scrubs the scene and the timeline together', () => {
    const { result, scene, setters } = transportHarness();

    result.current.scrub(12.5);

    expect(setters.setCurrentTime).toHaveBeenCalledWith(12.5);
    expect(scene.setTime).toHaveBeenCalledWith(12.5);
  });

  it('selects a chapter and rings the act shimmer', () => {
    const { result, scene, setters, audio } = transportHarness();

    result.current.selectAct(3);

    expect(setters.setActiveAct).toHaveBeenCalledWith(3);
    expect(scene.jumpToChapter).toHaveBeenCalledWith(3);
    expect(audio.triggerActShimmer).toHaveBeenCalledWith(3);
  });
});

describe('usePremiereSceneOptions', () => {
  function optionsHarness({ cameraMode = 'cinema', nitrateMode = false, audio = stubAudio() }: { cameraMode?: CameraMode; nitrateMode?: boolean; audio?: ReturnType<typeof stubAudio> } = {}) {
    const scene = stubScene();
    const managerRef = { current: scene as unknown as PremiereSceneApi };
    const audioRef = { current: audio as unknown as CinemaAudioEngine };
    const setters = {
      setCameraMode: vi.fn(),
      setNitrateMode: vi.fn(),
      setSoundOn: vi.fn(),
      setHeroConfig: vi.fn(),
      setActiveAct: vi.fn(),
      setIsPlaying: vi.fn(),
    };
    const { result } = renderHook(() =>
      usePremiereSceneOptions({ managerRef, audioRef, cameraMode, nitrateMode, ...setters }),
    );
    return { result, scene, setters, audio };
  }

  it('flips the camera between cinema and orbit', () => {
    const { result, scene, setters } = optionsHarness({ cameraMode: 'cinema' });

    result.current.toggleCameraMode();

    expect(setters.setCameraMode).toHaveBeenCalledWith('orbit');
    expect(scene.setCameraMode).toHaveBeenCalledWith('orbit');
  });

  it('flips back to cinema from orbit', () => {
    const { result, scene, setters } = optionsHarness({ cameraMode: 'orbit' });

    result.current.toggleCameraMode();

    expect(setters.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(scene.setCameraMode).toHaveBeenCalledWith('cinema');
  });

  it('toggles the nitrate grade', () => {
    const { result, scene, setters } = optionsHarness({ nitrateMode: false });

    result.current.toggleNitrateMode();

    expect(setters.setNitrateMode).toHaveBeenCalledWith(true);
    expect(scene.setNitrateMode).toHaveBeenCalledWith(true);
  });

  it('toggles sound through the audio engine', () => {
    const audio = stubAudio(false);
    const { result, setters } = optionsHarness({ audio });

    result.current.toggleSound();

    expect(audio.toggle).toHaveBeenCalledTimes(1);
    expect(setters.setSoundOn).toHaveBeenCalledWith(false);
  });

  it('ignores sound before the audio engine exists', () => {
    const setters = {
      setCameraMode: vi.fn(),
      setNitrateMode: vi.fn(),
      setSoundOn: vi.fn(),
      setHeroConfig: vi.fn(),
      setActiveAct: vi.fn(),
      setIsPlaying: vi.fn(),
    };
    const { result } = renderHook(() =>
      usePremiereSceneOptions({
        managerRef: { current: null },
        audioRef: { current: null },
        cameraMode: 'cinema',
        nitrateMode: false,
        ...setters,
      }),
    );

    result.current.toggleSound();

    expect(setters.setSoundOn).not.toHaveBeenCalled();
  });

  it('applies a new hero title and jumps to the reveal chapter', () => {
    const { result, scene, setters } = optionsHarness({ cameraMode: 'orbit' });
    const config: HeroTitleConfig = { ...DEFAULT_HERO_TITLE, mainTitle: 'GATSBY' };

    result.current.applyHeroTitle(config);

    expect(setters.setHeroConfig).toHaveBeenCalledWith(config);
    expect(scene.updateHeroTitle).toHaveBeenCalledWith(config);
    expect(setters.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(scene.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(scene.jumpToChapter).toHaveBeenCalledWith(4);
    expect(scene.setPlaying).toHaveBeenCalledWith(true);
    expect(setters.setActiveAct).toHaveBeenCalledWith(4);
    expect(setters.setIsPlaying).toHaveBeenCalledWith(true);
  });

  it('applies a hero title without a scene', () => {
    const setters = {
      setCameraMode: vi.fn(),
      setNitrateMode: vi.fn(),
      setSoundOn: vi.fn(),
      setHeroConfig: vi.fn(),
      setActiveAct: vi.fn(),
      setIsPlaying: vi.fn(),
    };
    const { result } = renderHook(() =>
      usePremiereSceneOptions({
        managerRef: { current: null },
        audioRef: { current: null },
        cameraMode: 'cinema',
        nitrateMode: false,
        ...setters,
      }),
    );

    result.current.applyHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: 'X' });

    expect(setters.setHeroConfig).toHaveBeenCalledTimes(1);
    expect(setters.setActiveAct).not.toHaveBeenCalled();
  });
});
