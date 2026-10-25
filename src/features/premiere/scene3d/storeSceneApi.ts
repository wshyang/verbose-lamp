import type { PremiereSceneApi } from '../scene/sceneApi';
import type { PremiereStore } from './premiereStore';

/** Adapts the Zustand store to the renderer-neutral `PremiereSceneApi` port. */
export function storeSceneApi(store: PremiereStore): PremiereSceneApi {
  const state = () => store.getState();
  return {
    updateHeroTitle: (config) => state().updateHeroTitle(config),
    jumpToChapter: (index) => state().jumpToChapter(index),
    setTime: (time) => state().setTime(time),
    setPlaying: (playing) => state().setPlaying(playing),
    togglePlaying: () => state().togglePlaying(),
    setCameraMode: (mode) => state().setCameraMode(mode),
    setNitrateMode: (enabled) => state().setNitrateMode(enabled),
    setSequenceFrameStyle: (style) => state().setSequenceFrameStyle(style),
    setScreenBorderStyle: (style) => state().setScreenBorderStyle(style),
    setScreenBorderEnabled: (enabled) => state().setScreenBorderEnabled(enabled),
  };
}
