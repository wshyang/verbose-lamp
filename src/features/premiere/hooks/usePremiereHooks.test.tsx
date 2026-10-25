// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { usePremiereSceneOptions } from './usePremiereSceneOptions';
import { usePremiereShortcuts } from './usePremiereShortcuts';
import { usePremiereTransport } from './usePremiereTransport';

/** A spy that satisfies the typed scene contract. */
function createSceneSpy(): PremiereSceneApi & { calls: string[] } {
  const calls: string[] = [];
  function record<T>(name: string, value: T): T {
    calls.push(name);
    return value;
  }
  return {
    calls,
    updateHeroTitle: (config) => void record('updateHeroTitle', config),
    jumpToChapter: (index) => void record(`jumpToChapter:${index}`, index),
    setTime: (t) => void record(`setTime:${t}`, t),
    setPlaying: (playing) => void record(`setPlaying:${playing}`, playing),
    togglePlaying: () => record('togglePlaying', false),
    setCameraMode: (mode) => void record(`setCameraMode:${mode}`, mode),
    setNitrateMode: (enabled) => void record(`setNitrateMode:${enabled}`, enabled),
    setSequenceFrameStyle: () => void record('setSequenceFrameStyle', null),
    setScreenBorderStyle: () => void record('setScreenBorderStyle', null),
    setScreenBorderEnabled: (enabled) => void record(`setScreenBorderEnabled:${enabled}`, enabled),
  };
}

describe('usePremiereTransport', () => {
  const setters = () => ({
    setCameraMode: vi.fn(),
    setCurrentTime: vi.fn(),
    setActiveAct: vi.fn(),
    setIsPlaying: vi.fn(),
  });

  it('toggles playback through the scene and mirrors its answer', () => {
    const scene = createSceneSpy();
    const set = setters();
    const { result } = renderHook(() =>
      usePremiereTransport({
        managerRef: { current: scene },
        audioRef: { current: null },
        cameraMode: 'cinema',
        ...set,
      })
    );
    act(() => result.current.togglePlayback());
    expect(scene.calls).toContain('togglePlaying');
    expect(set.setIsPlaying).toHaveBeenCalledWith(false);
  });

  it('does nothing when the scene is not mounted yet', () => {
    const scene = createSceneSpy();
    const set = setters();
    const { result } = renderHook(() =>
      usePremiereTransport({
        managerRef: { current: null },
        audioRef: { current: null },
        cameraMode: 'cinema',
        ...set,
      })
    );
    act(() => result.current.togglePlayback());
    act(() => result.current.replay());
    expect(set.setIsPlaying).not.toHaveBeenCalled();
    act(() => result.current.scrub(3));
    expect(set.setCurrentTime).toHaveBeenCalledWith(3);
    expect(scene.calls).toEqual([]);
  });

  it('replays from the top and drops out of orbit', () => {
    const scene = createSceneSpy();
    const set = setters();
    const { result } = renderHook(() =>
      usePremiereTransport({
        managerRef: { current: scene },
        audioRef: { current: null },
        cameraMode: 'orbit',
        ...set,
      })
    );
    act(() => result.current.replay());
    expect(set.setCameraMode).toHaveBeenCalledWith('cinema');
    expect(scene.calls).toEqual(expect.arrayContaining(['setCameraMode:cinema', 'setTime:0', 'setPlaying:true']));
    expect(set.setCurrentTime).toHaveBeenCalledWith(0);
  });

  it('scrubs and selects acts, shimmering with the act', () => {
    const scene = createSceneSpy();
    const set = setters();
    const shimmer = vi.fn();
    const { result } = renderHook(() =>
      usePremiereTransport({
        managerRef: { current: scene },
        audioRef: { current: { triggerActShimmer: shimmer } as never },
        cameraMode: 'cinema',
        ...set,
      })
    );
    act(() => result.current.scrub(12.5));
    expect(set.setCurrentTime).toHaveBeenCalledWith(12.5);
    act(() => result.current.selectAct(2));
    expect(set.setActiveAct).toHaveBeenCalledWith(2);
    expect(shimmer).toHaveBeenCalledWith(2);
  });
});

describe('usePremiereSceneOptions', () => {
  function renderOptions(overrides: { cameraMode?: 'cinema' | 'orbit'; nitrateMode?: boolean } = {}) {
    const scene = createSceneSpy();
    const set = {
      setCameraMode: vi.fn(),
      setNitrateMode: vi.fn(),
      setSoundOn: vi.fn(),
      setHeroConfig: vi.fn(),
      setActiveAct: vi.fn(),
      setIsPlaying: vi.fn(),
    };
    const toggle = vi.fn(() => true);
    const hook = renderHook(() =>
      usePremiereSceneOptions({
        managerRef: { current: scene },
        audioRef: { current: { toggle } as never },
        cameraMode: overrides.cameraMode ?? 'cinema',
        nitrateMode: overrides.nitrateMode ?? false,
        ...set,
      })
    );
    return { scene, set, toggle, hook };
  }

  it('flips between cinema and orbit, telling the scene', () => {
    const { scene, set, hook } = renderOptions();
    act(() => hook.result.current.toggleCameraMode());
    expect(set.setCameraMode).toHaveBeenCalledWith('orbit');
    expect(scene.calls).toContain('setCameraMode:orbit');
    hook.unmount();

    const orbit = renderOptions({ cameraMode: 'orbit' });
    act(() => orbit.hook.result.current.toggleCameraMode());
    expect(orbit.set.setCameraMode).toHaveBeenCalledWith('cinema');
  });

  it('toggles the nitrate filter', () => {
    const { scene, set, hook } = renderOptions({ nitrateMode: true });
    act(() => hook.result.current.toggleNitrateMode());
    expect(set.setNitrateMode).toHaveBeenCalledWith(false);
    expect(scene.calls).toContain('setNitrateMode:false');
  });

  it('toggles sound and reports the engine answer', () => {
    const { set, toggle, hook } = renderOptions();
    act(() => hook.result.current.toggleSound());
    expect(toggle).toHaveBeenCalled();
    expect(set.setSoundOn).toHaveBeenCalledWith(true);
  });

  it('ignores sound toggles before the audio engine exists', () => {
    const set = {
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
        ...set,
      })
    );
    act(() => result.current.toggleSound());
    expect(set.setSoundOn).not.toHaveBeenCalled();
  });

  it('applies a hero title, returning to cinema and jumping to act V', () => {
    const { scene, set, hook } = renderOptions({ cameraMode: 'orbit' });
    const hero = { keystone: 'THE', preTitle: 'GREAT', mainTitle: 'GATSBY', subCredit: '', pinstripeAlternation: true };
    act(() => hook.result.current.applyHeroTitle(hero));
    expect(set.setHeroConfig).toHaveBeenCalledWith(hero);
    expect(scene.calls).toEqual(
      expect.arrayContaining(['updateHeroTitle', 'setCameraMode:cinema', 'jumpToChapter:4', 'setPlaying:true'])
    );
    expect(set.setActiveAct).toHaveBeenCalledWith(4);
    expect(set.setIsPlaying).toHaveBeenCalledWith(true);
  });

  it('applies a hero title without a scene', () => {
    const set = {
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
        ...set,
      })
    );
    act(() => result.current.applyHeroTitle({ ...JSON.parse(JSON.stringify({ keystone: 'THE', preTitle: 'G', mainTitle: 'GATSBY', subCredit: '', pinstripeAlternation: true })) }));
    expect(set.setHeroConfig).toHaveBeenCalled();
    expect(set.setActiveAct).not.toHaveBeenCalled();
  });
});

describe('usePremiereShortcuts', () => {
  function press(key: string, options: { code?: string; target?: HTMLElement } = {}) {
    const event = new KeyboardEvent('keydown', { key, code: options.code, bubbles: true, cancelable: true });
    (options.target ?? window).dispatchEvent(event);
  }

  function renderShortcuts(overrides: Partial<Parameters<typeof usePremiereShortcuts>[0]> = {}) {
    const actions = {
      isDialogOpen: false,
      togglePlayback: vi.fn(),
      selectAct: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleHud: vi.fn(),
      ...overrides,
    };
    renderHook(() => usePremiereShortcuts(actions));
    return actions;
  }

  it('binds space, digits, o and h', () => {
    const actions = renderShortcuts();
    press(' ', { code: 'Space' });
    press('3');
    press('o');
    press('h');
    expect(actions.togglePlayback).toHaveBeenCalledOnce();
    expect(actions.selectAct).toHaveBeenCalledWith(2);
    expect(actions.toggleCameraMode).toHaveBeenCalledOnce();
    expect(actions.toggleHud).toHaveBeenCalledOnce();
  });

  it('ignores keys while a dialog is open', () => {
    const actions = renderShortcuts({ isDialogOpen: true });
    press(' ', { code: 'Space' });
    press('1');
    expect(actions.togglePlayback).not.toHaveBeenCalled();
    expect(actions.selectAct).not.toHaveBeenCalled();
  });

  it('ignores keys typed into a field', () => {
    const actions = renderShortcuts();
    for (const tag of ['input', 'textarea', 'select']) {
      const element = document.createElement(tag);
      document.body.appendChild(element);
      press('1', { target: element });
      element.remove();
    }
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    press('o', { target: editable });
    editable.remove();

    expect(actions.selectAct).not.toHaveBeenCalled();
    expect(actions.toggleCameraMode).not.toHaveBeenCalled();
  });

  it('treats a non-element target as a normal keypress', () => {
    const actions = renderShortcuts();
    press('o', { target: document as unknown as HTMLElement });
    expect(actions.toggleCameraMode).toHaveBeenCalledOnce();
  });

  it('stops listening when unmounted', () => {
    const actions = {
      isDialogOpen: false,
      togglePlayback: vi.fn(),
      selectAct: vi.fn(),
      toggleCameraMode: vi.fn(),
      toggleHud: vi.fn(),
    };
    const { unmount } = renderHook(() => usePremiereShortcuts(actions));
    unmount();
    press('h');
    press(' ', { code: 'Space' });
    expect(actions.toggleHud).not.toHaveBeenCalled();
    expect(actions.togglePlayback).not.toHaveBeenCalled();
    expect(SEQUENCE_CHAPTERS).toHaveLength(5);
  });
});

describe('scene refs', () => {
  it('accepts a typed null ref, which is what the hooks hold before mount', () => {
    const ref = createRef<PremiereSceneApi>();
    expect(ref.current).toBeNull();
    ref.current = createSceneSpy();
    expect(ref.current?.togglePlaying()).toBe(false);
  });
});
