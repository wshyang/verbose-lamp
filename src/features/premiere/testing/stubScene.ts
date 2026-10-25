import { vi, type Mock } from 'vitest';
import type { PremiereSceneApi } from '../scene/sceneApi';

/**
 * A spy-backed scene. The hooks only know `PremiereSceneApi`, so this stands in
 * for the WebGL renderer without a canvas (ADDENDUM-027 §2).
 */
export type SceneSpies = { [K in keyof PremiereSceneApi]: Mock };

export function stubScene(): SceneSpies {
  const scene: PremiereSceneApi = {
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
  return scene as unknown as SceneSpies;
}

/** The slice of the audio engine the premiere hooks touch. */
export function stubAudio(toggleResult = true) {
  return {
    toggle: vi.fn(() => toggleResult),
    triggerActShimmer: vi.fn(),
    dispose: vi.fn(),
  };
}
