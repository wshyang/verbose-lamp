import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import { activeChapterIndex, clamp } from '../scene/choreography';
import type { PremiereSceneApi } from '../scene/sceneApi';
import { orbitFocusTime } from './orbitFocus';
import { clampBorderStyle, clampFrameStyle } from './styleClamp';

/** How far into a chapter a jump lands: past the frame draw-on (ADDENDUM-022 §2.1). */
export const CHAPTER_JUMP_OFFSET = 0.15;

export interface OrbitFocusRequest {
  chapterIndex: number;
  /** Monotonic: the camera re-applies whenever this changes. */
  nonce: number;
}

export interface PremiereActions {
  setTime: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  /** Flips playback and reports the new value, like the imperative manager. */
  togglePlaying: () => boolean;
  setCameraMode: (mode: CameraMode) => void;
  setNitrateMode: (forced: boolean) => void;
  setHeroConfig: (config: HeroTitleConfig) => void;
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
  jumpToChapter: (index: number) => void;
  /** Snaps the orbit camera onto a chapter's hold; the playhead moves only if it must. */
  focusOrbit: (chapterIndex: number) => void;
  setActiveChapterIndex: (index: number) => void;
  setElapsed: (seconds: number) => void;
}

export interface PremiereState {
  currentTime: number;
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNitrateForced: boolean;
  heroConfig: HeroTitleConfig;
  frameStyle: FrameStyle;
  borderStyle: ScreenBorderStyle;
  isBorderEnabled: boolean;
  freezeAt: number | null;
  activeChapterIndex: number;
  orbitFocus: OrbitFocusRequest | null;
  /** Seconds since the scene started (or the frozen time), shared by every frame. */
  elapsed: number;
}

export type PremiereStore = PremiereState & PremiereActions;
export type PremiereStoreApi = StoreApi<PremiereStore>;

function defaultFrameStyle(): FrameStyle {
  return {
    intricacy: DEFAULT_FRAME_STYLE.intricacy,
    formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME } },
  };
}

export interface PremiereStoreOptions {
  /** `?freezeAt=` — pins the playhead and pauses (see `model/freeze.ts`). */
  freezeAt?: number;
}

/** The setter/getter pair zustand hands the initialiser. */
type StoreWrite = (partial: Partial<PremiereStore> | ((state: PremiereStore) => Partial<PremiereStore>)) => void;
type StoreRead = () => PremiereStore;

/** A frozen playhead starts paused; a live one starts playing. */
export function initialPremiereState(freezeAt: number | null): PremiereState {
  return {
    currentTime: freezeAt ?? 0,
    isPlaying: freezeAt === null,
    cameraMode: 'cinema',
    isNitrateForced: false,
    heroConfig: { ...DEFAULT_HERO_TITLE },
    frameStyle: defaultFrameStyle(),
    borderStyle: { ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } },
    isBorderEnabled: false,
    freezeAt,
    activeChapterIndex: activeChapterIndex(freezeAt ?? 0, SEQUENCE_CHAPTERS),
    orbitFocus: null,
    elapsed: freezeAt ?? 0,
  };
}

/** The playhead, the pause flag and the chapter jumps. */
export function playbackActions(set: StoreWrite, get: StoreRead) {
  return {
    setTime: (t: number) => set({ currentTime: clamp(t, 0, TOTAL_SEQUENCE_DURATION - 0.001) }),
    setPlaying: (playing: boolean) => set({ isPlaying: playing }),
    togglePlaying: () => {
      const next = !get().isPlaying;
      set({ isPlaying: next });
      return next;
    },
    jumpToChapter: (index: number) => {
      const chapterIndex = clamp(index, 0, SEQUENCE_CHAPTERS.length - 1);
      const time = SEQUENCE_CHAPTERS[chapterIndex].startTime + CHAPTER_JUMP_OFFSET;
      set({ currentTime: time, activeChapterIndex: chapterIndex });
      if (get().cameraMode === 'orbit') get().focusOrbit(chapterIndex);
    },
    setActiveChapterIndex: (index: number) => set({ activeChapterIndex: index }),
    setElapsed: (seconds: number) => set({ elapsed: seconds }),
  };
}

/** The camera: the mode switch, and the orbit snap that seeks the playhead if it must. */
export function cameraActions(set: StoreWrite, get: StoreRead) {
  return {
    setCameraMode: (mode: CameraMode) => {
      set({ cameraMode: mode });
      if (mode === 'orbit') get().focusOrbit(activeChapterIndex(get().currentTime, SEQUENCE_CHAPTERS));
    },
    focusOrbit: (chapterIndex: number) => {
      const chapter = SEQUENCE_CHAPTERS[chapterIndex];
      const focus = orbitFocusTime({ currentTime: get().currentTime, chapter });
      set((state) => ({
        currentTime: focus.time,
        isPlaying: focus.pause ? false : state.isPlaying,
        orbitFocus: { chapterIndex, nonce: (state.orbitFocus?.nonce ?? 0) + 1 },
      }));
    },
  };
}

/** Everything the host pushes in: the title, the frame, the border and the film stock. */
export function styleActions(set: StoreWrite) {
  return {
    setNitrateMode: (forced: boolean) => set({ isNitrateForced: forced }),
    setHeroConfig: (config: HeroTitleConfig) => set({ heroConfig: { ...config } }),
    setSequenceFrameStyle: (style: FrameStyle) => set({ frameStyle: clampFrameStyle(style) }),
    setScreenBorderStyle: (style: ScreenBorderStyle) => set({ borderStyle: clampBorderStyle(style) }),
    setScreenBorderEnabled: (enabled: boolean) => set({ isBorderEnabled: enabled }),
  };
}

/**
 * The scene's state machine (ADDENDUM-022 §2.1). A vanilla store, not a React
 * one: the render loop reads it per frame without re-rendering React, and pure
 * tests can drive it with no DOM at all.
 *
 * The actions are three groups — playback, camera, host-pushed style — composed
 * here, so each group can be read (and tested) without the other two in the way
 * (ADDENDUM-039).
 */
export function createPremiereStore(options: PremiereStoreOptions = {}): PremiereStoreApi {
  const freezeAt = options.freezeAt ?? null;
  return createStore<PremiereStore>()((set, get) => ({
    ...initialPremiereState(freezeAt),
    ...playbackActions(set, get),
    ...cameraActions(set, get),
    ...styleActions(set),
  }));
}

/**
 * Reads one field of the store from a component. React re-renders only when the
 * selected field changes, so per-frame reads stay in `useFrame` (ADDENDUM-022 §2.1).
 */
export function usePremiereStore<T>(store: PremiereStoreApi, selector: (state: PremiereStore) => T): T {
  return useStore(store, selector);
}

/**
 * Adapter so `usePremiereTransport`, `usePremiereSceneOptions` and `useFrameStudio`
 * keep talking to `PremiereSceneApi` and never learn that the state moved into a
 * store (ADDENDUM-022 §2.1).
 */
export function storeSceneApi(store: PremiereStoreApi): PremiereSceneApi {
  const actions = () => store.getState();
  return {
    updateHeroTitle: (config) => actions().setHeroConfig(config),
    jumpToChapter: (index) => actions().jumpToChapter(index),
    setTime: (t) => actions().setTime(t),
    setPlaying: (playing) => actions().setPlaying(playing),
    togglePlaying: () => actions().togglePlaying(),
    setCameraMode: (mode) => actions().setCameraMode(mode),
    setNitrateMode: (enabled) => actions().setNitrateMode(enabled),
    setSequenceFrameStyle: (style) => actions().setSequenceFrameStyle(style),
    setScreenBorderStyle: (style) => actions().setScreenBorderStyle(style),
    setScreenBorderEnabled: (enabled) => actions().setScreenBorderEnabled(enabled),
  };
}
