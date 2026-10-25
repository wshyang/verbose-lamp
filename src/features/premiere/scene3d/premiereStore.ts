import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import {
  DEFAULT_HERO_TITLE,
  SEQUENCE_CHAPTERS,
  TOTAL_SEQUENCE_DURATION,
} from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type { PremiereSceneApi } from '../scene/sceneApi';
import {
  chapterJumpTarget,
  clampFrameStyle,
  clampScreenBorderStyle,
  clampSequenceTime,
} from '../scene/styleClamp';

/**
 * The R3F premiere's single source of truth (ADDENDUM-022 §2.1). Initial
 * values mirror GatsbySceneManager's field initialisers 1:1, so swapping
 * the renderer behind PremiereSceneApi changes no behaviour. A vanilla
 * store: the scene reads it imperatively per frame, React via selectors.
 */
export interface PremiereStoreState {
  currentTime: number;
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNitrateForced: boolean;
  heroConfig: HeroTitleConfig;
  frameStyle: FrameStyle;
  borderStyle: ScreenBorderStyle;
  isBorderEnabled: boolean;
  freezeAt: number | null;
  /**
   * Bumped whenever the orbit camera should (re)focus: on a chapter jump
   * and on entering orbit mode — the two places the manager called
   * focusOrbitOnChapter. CinemaCamera effects subscribe to it.
   */
  orbitFocusSerial: number;
  /** Advance the playhead by dt (caller caps it); frozen/paused is a no-op, the loop wraps to 0. */
  advanceBy: (dt: number) => void;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => boolean;
  jumpToChapter: (index: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setNitrateForced: (forced: boolean) => void;
  updateHeroTitle: (config: HeroTitleConfig) => void;
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
}

export type PremiereStore = StoreApi<PremiereStoreState>;

export function createPremiereStore(freezeAt: number | null = null): PremiereStore {
  return createStore<PremiereStoreState>()((set, get) => ({
    currentTime: freezeAt ?? 0,
    isPlaying: freezeAt === null,
    cameraMode: 'cinema',
    isNitrateForced: false,
    heroConfig: { ...DEFAULT_HERO_TITLE },
    frameStyle: {
      intricacy: DEFAULT_FRAME_STYLE.intricacy,
      formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME } },
    },
    borderStyle: { ...DEFAULT_SCREEN_BORDER_STYLE },
    isBorderEnabled: false,
    freezeAt,
    orbitFocusSerial: 0,
    advanceBy: (dt) => {
      const state = get();
      if (state.freezeAt !== null || !state.isPlaying) return;
      const next = state.currentTime + dt;
      set({ currentTime: next >= TOTAL_SEQUENCE_DURATION ? 0 : next });
    },
    setTime: (time) => set({ currentTime: clampSequenceTime(time) }),
    setPlaying: (isPlaying) => set({ isPlaying }),
    togglePlaying: () => {
      set({ isPlaying: !get().isPlaying });
      return get().isPlaying;
    },
    jumpToChapter: (index) =>
      set((state) => ({
        currentTime: chapterJumpTarget(index, SEQUENCE_CHAPTERS).time,
        orbitFocusSerial: state.orbitFocusSerial + 1,
      })),
    setCameraMode: (cameraMode) =>
      set((state) =>
        cameraMode === 'orbit'
          ? { cameraMode, orbitFocusSerial: state.orbitFocusSerial + 1 }
          : { cameraMode },
      ),
    setNitrateForced: (isNitrateForced) => set({ isNitrateForced }),
    updateHeroTitle: (config) => set({ heroConfig: { ...config } }),
    setSequenceFrameStyle: (style) => set({ frameStyle: clampFrameStyle(style) }),
    setScreenBorderStyle: (style) => set({ borderStyle: clampScreenBorderStyle(style) }),
    setScreenBorderEnabled: (isBorderEnabled) => set({ isBorderEnabled }),
  }));
}

/**
 * Exposes the store through the existing PremiereSceneApi port (§2.4), so
 * the transport, scene-options and Frame Studio hooks keep calling the same
 * methods while the R3F scene subscribes to the state behind them.
 */
export function storeSceneApi(store: PremiereStore): PremiereSceneApi {
  const state = () => store.getState();
  return {
    updateHeroTitle: (config) => state().updateHeroTitle(config),
    jumpToChapter: (index) => state().jumpToChapter(index),
    setTime: (time) => state().setTime(time),
    setPlaying: (playing) => state().setPlaying(playing),
    togglePlaying: () => state().togglePlaying(),
    setCameraMode: (mode) => state().setCameraMode(mode),
    setNitrateMode: (enabled) => state().setNitrateForced(enabled),
    setSequenceFrameStyle: (style) => state().setSequenceFrameStyle(style),
    setScreenBorderStyle: (style) => state().setScreenBorderStyle(style),
    setScreenBorderEnabled: (enabled) => state().setScreenBorderEnabled(enabled),
    // The store owns no GPU resources; unmounting the Canvas disposes the scene.
    dispose: () => {},
  };
}
