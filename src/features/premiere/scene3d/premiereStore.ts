import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  normalizeFrameStyle,
  normalizeScreenBorderStyle,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import { activeChapterIndex } from '../scene/choreography';
import { orbitFocusPlan } from '../scene/orbitFocus';
import { advanceClock, advanceElapsed } from '../scene/playback';
import { chapterJumpTarget, clampSequenceTime } from '../scene/styleClamp';

export interface OrbitFocusRequest {
  chapterIndex: number;
  /** Monotonic: the camera re-applies whenever this changes, even to the same chapter. */
  nonce: number;
}

export interface PremiereState {
  currentTime: number;
  /** Shader clock: wall time, or the frozen time on a frozen frame. */
  elapsed: number;
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNitrateForced: boolean;
  heroConfig: HeroTitleConfig;
  frameStyle: FrameStyle;
  borderStyle: ScreenBorderStyle;
  isBorderEnabled: boolean;
  freezeAt: number | null;
  activeChapterIndex: number;
  /** Counts frame-style changes, so the cards rebuild once per frame however many arrive. */
  frameStyleVersion: number;
  orbitFocus: OrbitFocusRequest | null;
}

export interface PremiereActions {
  setTime: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  /** Flips playback and reports the new value, like the imperative manager. */
  togglePlaying: () => boolean;
  /** Advances both clocks by one frame (see `advanceClock`, `advanceElapsed`). */
  advance: (deltaSeconds: number) => void;
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
}

export type PremiereStore = PremiereState & PremiereActions;
export type PremiereStoreApi = StoreApi<PremiereStore>;

export interface PremiereStoreOptions {
  /** `?freezeAt=`: pins the playhead and pauses (see `model/freeze.ts`). */
  freezeAt?: number | null;
  heroConfig?: HeroTitleConfig;
  frameStyle?: FrameStyle;
  screenBorderStyle?: ScreenBorderStyle;
  isBorderEnabled?: boolean;
}

/** The setter/getter pair zustand hands the initialiser. */
type StoreWrite = (
  partial: Partial<PremiereStore> | ((state: PremiereStore) => Partial<PremiereStore>),
) => void;
type StoreRead = () => PremiereStore;

/**
 * A frozen playhead starts paused at its time; a live one starts playing. Styles run
 * through the clamps, which build fresh objects, so the shared default genomes are never
 * aliased into a store.
 */
export function initialPremiereState(options: PremiereStoreOptions = {}): PremiereState {
  const freezeAt = options.freezeAt ?? null;
  const currentTime = freezeAt === null ? 0 : clampSequenceTime(freezeAt);
  return {
    currentTime,
    elapsed: freezeAt ?? 0,
    isPlaying: freezeAt === null,
    cameraMode: 'cinema',
    isNitrateForced: false,
    heroConfig: { ...(options.heroConfig ?? DEFAULT_HERO_TITLE) },
    frameStyle: normalizeFrameStyle(options.frameStyle ?? DEFAULT_FRAME_STYLE),
    borderStyle: normalizeScreenBorderStyle(options.screenBorderStyle ?? DEFAULT_SCREEN_BORDER_STYLE),
    isBorderEnabled: options.isBorderEnabled ?? false,
    freezeAt,
    activeChapterIndex: activeChapterIndex(currentTime, SEQUENCE_CHAPTERS),
    frameStyleVersion: 0,
    orbitFocus: null,
  };
}

/** The playhead, the pause flag, the clocks and the chapter jumps. */
export function playbackActions(set: StoreWrite, get: StoreRead) {
  return {
    setTime: (seconds: number) => set({ currentTime: clampSequenceTime(seconds) }),
    setPlaying: (playing: boolean) => set({ isPlaying: playing }),
    togglePlaying: () => {
      const next = !get().isPlaying;
      set({ isPlaying: next });
      return next;
    },
    advance: (deltaSeconds: number) =>
      set((state) => ({
        currentTime: advanceClock(
          { time: state.currentTime, isPlaying: state.isPlaying, isFrozen: state.freezeAt !== null },
          deltaSeconds,
        ),
        elapsed: advanceElapsed(state.elapsed, deltaSeconds, state.freezeAt),
      })),
    jumpToChapter: (index: number) => {
      const target = chapterJumpTarget(index, SEQUENCE_CHAPTERS);
      set({ currentTime: target.time, activeChapterIndex: target.index });
      if (get().cameraMode === 'orbit') get().focusOrbit(target.index);
    },
    setActiveChapterIndex: (index: number) => set({ activeChapterIndex: index }),
  };
}

/** The camera: the mode switch, and the orbit snap that seeks the playhead if it must. */
export function cameraActions(set: StoreWrite, get: StoreRead) {
  return {
    setCameraMode: (mode: CameraMode) => {
      set({ cameraMode: mode });
      if (mode === 'orbit') {
        get().focusOrbit(activeChapterIndex(get().currentTime, SEQUENCE_CHAPTERS));
      }
    },
    focusOrbit: (chapterIndex: number) => {
      const plan = orbitFocusPlan(get().currentTime, SEQUENCE_CHAPTERS[chapterIndex]);
      set((state) => ({
        currentTime: plan.time ?? state.currentTime,
        isPlaying: plan.time === null ? state.isPlaying : false,
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
    setSequenceFrameStyle: (style: FrameStyle) =>
      set((state) => ({
        frameStyle: normalizeFrameStyle(style),
        frameStyleVersion: state.frameStyleVersion + 1,
      })),
    setScreenBorderStyle: (style: ScreenBorderStyle) =>
      set({ borderStyle: normalizeScreenBorderStyle(style) }),
    setScreenBorderEnabled: (enabled: boolean) => set({ isBorderEnabled: enabled }),
  };
}

/**
 * The scene's state machine (ADDENDUM-022 §2.1). A vanilla store, not a React one: the
 * render loop reads it per frame without re-rendering React, and pure tests drive it with
 * no DOM at all. The actions are three groups composed here, so each can be read (and
 * tested) without the other two in the way.
 */
export function createPremiereStore(options: PremiereStoreOptions = {}): PremiereStoreApi {
  return createStore<PremiereStore>()((set, get) => ({
    ...initialPremiereState(options),
    ...playbackActions(set, get),
    ...cameraActions(set, get),
    ...styleActions(set),
  }));
}

/**
 * Reads one field of the store from a component. React re-renders only when the selected
 * field changes, so per-frame reads stay in `useFrame`.
 */
export function usePremiereStore<T>(store: PremiereStoreApi, selector: (state: PremiereStore) => T): T {
  return useStore(store, selector);
}
