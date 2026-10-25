import type { PremiereSceneApi } from '../scene/sceneApi';
import type { PremiereStoreApi } from './premiereStore';

/**
 * `PremiereSceneApi` on top of the store (ADDENDUM-022 §2.4).
 *
 * The transport, the scene options and Frame Studio keep calling the same methods they
 * always have; only the object behind the ref changes. Every call reads the store's live
 * state, so the adapter can be created once and outlive any number of actions.
 */
export function storeSceneApi(store: PremiereStoreApi): PremiereSceneApi {
  const actions = () => store.getState();
  return {
    updateHeroTitle: (config) => actions().setHeroConfig(config),
    jumpToChapter: (index) => actions().jumpToChapter(index),
    setTime: (seconds) => actions().setTime(seconds),
    setPlaying: (playing) => actions().setPlaying(playing),
    togglePlaying: () => actions().togglePlaying(),
    setCameraMode: (mode) => actions().setCameraMode(mode),
    setNitrateMode: (enabled) => actions().setNitrateMode(enabled),
    setSequenceFrameStyle: (style) => actions().setSequenceFrameStyle(style),
    setScreenBorderStyle: (style) => actions().setScreenBorderStyle(style),
    setScreenBorderEnabled: (enabled) => actions().setScreenBorderEnabled(enabled),
    // Deliberately nothing. The Canvas owns every GPU resource and releases it on unmount;
    // pausing here (as PR #3 did) leaves a StrictMode remount loaded but paused.
    dispose: () => {},
  };
}
