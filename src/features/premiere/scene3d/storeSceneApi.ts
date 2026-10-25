import type { PremiereSceneApi } from '../scene/sceneApi';
import type { PremiereStore } from './premiereStore';

/**
 * `PremiereSceneApi` on top of the store (ADDENDUM-022 §6 step 2.1).
 *
 * This is the whole point of the port's wiring: the transport, the scene options and
 * Frame Studio keep calling the same imperative methods they always have, and only
 * the object behind `managerRef` changes.
 */
export function storeSceneApi(store: PremiereStore): PremiereSceneApi {
  return {
    updateHeroTitle: (config) => store.getState().setHeroTitle(config),
    jumpToChapter: (index) => store.getState().jumpToChapter(index),
    setTime: (seconds) => store.getState().setTime(seconds),
    setPlaying: (playing) => store.getState().setPlaying(playing),
    togglePlaying: () => store.getState().togglePlaying(),
    setCameraMode: (mode) => store.getState().setCameraMode(mode),
    setNitrateMode: (enabled) => store.getState().setNitrateMode(enabled),
    setSequenceFrameStyle: (style) => store.getState().setFrameStyle(style),
    setScreenBorderStyle: (style) => store.getState().setScreenBorderStyle(style),
    setScreenBorderEnabled: (enabled) => store.getState().setScreenBorderEnabled(enabled),
    // Nothing to tear down: the store outlives no GPU resource. The Canvas owns those
    // and disposes them on unmount.
    dispose: () => {},
  };
}
