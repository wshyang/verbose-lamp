// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import type { CameraMode } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereController } from './usePremiereController';
import { usePremiereRuntime } from './usePremiereRuntime';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereShortcuts } from './usePremiereShortcuts';
import { usePremiereTransport } from './usePremiereTransport';

const audio = vi.hoisted(() => ({ instances: [] as Array<{
  toggle: ReturnType<typeof vi.fn>;
  triggerActShimmer: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> }));

vi.mock('../audio/cinemaAudio', () => ({
  CinemaAudioEngine: class {
    toggle = vi.fn(() => true);
    triggerActShimmer = vi.fn();
    dispose = vi.fn();
    constructor() {
      audio.instances.push(this);
    }
  },
}));

function sceneApi(): PremiereSceneApi {
  return {
    updateHeroTitle: vi.fn(),
    jumpToChapter: vi.fn(),
    setTime: vi.fn(),
    setPlaying: vi.fn(),
    togglePlaying: vi.fn(() => false),
    setCameraMode: vi.fn(),
    setNitrateMode: vi.fn(),
    setSequenceFrameStyle: vi.fn(),
    setScreenBorderStyle: vi.fn(),
    setScreenBorderEnabled: vi.fn(),
  };
}

beforeEach(() => {
  audio.instances = [];
  window.history.replaceState(null, '', '/');
});

afterEach(() => vi.restoreAllMocks());

describe('usePremiereRuntime', () => {
  it('creates a frozen store from the URL, forwards latest callbacks, and disposes audio', () => {
    window.history.replaceState(null, '', '/?freezeAt=2.5');
    const first = { onTelemetry: vi.fn(), onChapterChange: vi.fn() };
    const latest = { onTelemetry: vi.fn(), onChapterChange: vi.fn() };
    const { result, rerender, unmount } = renderHook(
      (props: typeof first) => usePremiereRuntime(props),
      { initialProps: first }
    );
    expect(result.current.store.getState()).toMatchObject({ currentTime: 2.5, isPlaying: false, freezeAt: 2.5 });
    expect(result.current.audioRef.current).toBe(audio.instances[0]);
    rerender(latest);
    act(() => {
      result.current.store.getState().callbacks.onTelemetry({ currentTime: 3, activeChapterIndex: 1, isPlaying: false });
      result.current.store.getState().callbacks.onChapterChange(2);
    });
    expect(first.onTelemetry).not.toHaveBeenCalled();
    expect(latest.onTelemetry).toHaveBeenCalledOnce();
    expect(latest.onChapterChange).toHaveBeenCalledWith(2);
    expect(audio.instances[0].triggerActShimmer).toHaveBeenCalledWith(2);
    unmount();
    expect(audio.instances[0].dispose).toHaveBeenCalledOnce();
    expect(result.current.audioRef.current).toBeNull();
  });

  it('does not clear a replacement audio ref during cleanup', () => {
    const callbacks = { onTelemetry: vi.fn(), onChapterChange: vi.fn() };
    const { result, unmount } = renderHook(() => usePremiereRuntime(callbacks));
    const replacement = audio.instances[0];
    const internal = result.current.audioRef as unknown as { current: unknown };
    internal.current = { replacement: true };
    unmount();
    expect(internal.current).toEqual({ replacement: true });
    expect(replacement.dispose).toHaveBeenCalledOnce();
  });
});

describe('transport and scene option hooks', () => {
  it('forwards transport in cinema and orbit modes, with or without audio', () => {
    const api = sceneApi();
    const setters = {
      setCameraMode: vi.fn(), setCurrentTime: vi.fn(), setActiveAct: vi.fn(), setIsPlaying: vi.fn(),
    };
    const audioRef = { current: null };
    const props = { sceneApi: api, audioRef, cameraMode: 'cinema' as CameraMode, ...setters };
    const { result, rerender } = renderHook((p: typeof props) => usePremiereTransport(p), { initialProps: props });
    act(() => result.current.togglePlayback());
    act(() => result.current.replay());
    act(() => result.current.scrub(8));
    act(() => result.current.selectAct(3));
    expect(setters.setIsPlaying).toHaveBeenCalledWith(false);
    expect(api.setTime).toHaveBeenCalledWith(0);
    expect(api.jumpToChapter).toHaveBeenCalledWith(3);

    const shimmer = vi.fn();
    audioRef.current = { triggerActShimmer: shimmer } as never;
    rerender({ ...props, cameraMode: 'orbit' });
    act(() => result.current.replay());
    act(() => result.current.selectAct(1));
    expect(setters.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(shimmer).toHaveBeenCalledWith(1);
  });

  it('toggles options and applies a title from both camera modes', () => {
    const api = sceneApi();
    const setters = {
      setCameraMode: vi.fn(), setNitrateMode: vi.fn(), setSoundOn: vi.fn(),
      setHeroConfig: vi.fn(), setActiveAct: vi.fn(), setIsPlaying: vi.fn(),
    };
    const audioRef = { current: null };
    const props = {
      sceneApi: api, audioRef, cameraMode: 'cinema' as CameraMode, nitrateMode: false, ...setters,
    };
    const { result, rerender } = renderHook((p: typeof props) => usePremiereSceneOptions(p), { initialProps: props });
    act(() => result.current.toggleCameraMode());
    act(() => result.current.toggleNitrateMode());
    act(() => result.current.toggleSound());
    expect(api.setCameraMode).toHaveBeenCalledWith('orbit');
    expect(api.setNitrateMode).toHaveBeenCalledWith(true);
    expect(setters.setSoundOn).not.toHaveBeenCalled();

    audioRef.current = { toggle: vi.fn(() => true) } as never;
    rerender({ ...props, cameraMode: 'orbit', nitrateMode: true });
    act(() => result.current.toggleCameraMode());
    act(() => result.current.toggleNitrateMode());
    act(() => result.current.toggleSound());
    const title = { ...DEFAULT_HERO_TITLE, mainTitle: 'B' };
    act(() => result.current.applyHeroTitle(title));
    expect(setters.setSoundOn).toHaveBeenCalledWith(true);
    expect(api.updateHeroTitle).toHaveBeenCalledWith(title);
    expect(api.jumpToChapter).toHaveBeenCalledWith(4);

    rerender({ ...props, cameraMode: 'cinema' });
    act(() => result.current.applyHeroTitle(title));
    expect(api.setPlaying).toHaveBeenCalledWith(true);
    expect(setters.setActiveAct).toHaveBeenCalledWith(4);
  });
});

describe('usePremiereController', () => {
  it('throttles telemetry, tracks chapters, and exposes wired controllers', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(10);
    const { result } = renderHook(() => usePremiereController());
    const callbacks = result.current.sceneStore.getState().callbacks;
    act(() => callbacks.onTelemetry({ currentTime: 1, activeChapterIndex: 0, isPlaying: false }));
    expect(result.current.currentTime).toBe(0);
    now.mockReturnValue(100);
    act(() => callbacks.onTelemetry({ currentTime: 2, activeChapterIndex: 0, isPlaying: false }));
    expect(result.current).toMatchObject({ currentTime: 2, isPlaying: false });
    now.mockReturnValue(120);
    act(() => callbacks.onTelemetry({ currentTime: 3, activeChapterIndex: 0, isPlaying: true }));
    expect(result.current.currentTime).toBe(2);
    act(() => callbacks.onChapterChange(99));
    expect(result.current.activeAct).toBe(99);
    expect(result.current.currentChapter).toBe(SEQUENCE_CHAPTERS[0]);
    act(() => result.current.toggleSound());
    expect(result.current.soundOn).toBe(true);
    act(() => result.current.frameStudio.setBorderEnabled(true));
    expect(result.current.sceneStore.getState().isBorderEnabled).toBe(true);
  });
});

describe('usePremiereShortcuts', () => {
  it('handles playback, act, orbit, and HUD keys while ignoring dialogs and text entry', () => {
    const actions = {
      isDialogOpen: false,
      togglePlayback: vi.fn(), selectAct: vi.fn(), toggleCameraMode: vi.fn(), toggleHud: vi.fn(),
    };
    const { rerender, unmount } = renderHook(
      (props: typeof actions) => usePremiereShortcuts(props),
      { initialProps: actions }
    );
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false);
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyDown(window, { key: '6' });
    fireEvent.keyDown(window, { key: 'O' });
    fireEvent.keyDown(window, { key: 'h' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(actions.selectAct).toHaveBeenCalledTimes(2);

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.append(input, textarea, select, editable);
    for (const element of [input, textarea, select, editable]) fireEvent.keyDown(element, { key: 'o' });
    expect(actions.toggleCameraMode).toHaveBeenCalledOnce();

    rerender({ ...actions, isDialogOpen: true });
    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleHud).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleHud).toHaveBeenCalledOnce();
  });
});
