import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex } from '../scene/choreography';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import {
  chapterJumpTime,
  clampChapterIndex,
  clampFrameStyle,
  clampScreenBorderStyle,
  clampSequenceTime,
} from '../scene/styleClamp';
import { advanceClock, advanceElapsed } from './playback';

/**
 * The premiere's scene state as a vanilla store (ADDENDUM-022 §6 step 2.1).
 *
 * Vanilla, not a React context: `PremiereSceneApi` already gives every hook an
 * imperative handle, so `usePremiereTransport`, `usePremiereSceneOptions` and
 * `useFrameStudio` keep working untouched through the adapter in
 * `storeSceneApi.ts`. The components read the same store with `useStore`.
 */
export interface PremiereSceneState {
  currentTime: number;
  /** Wall-clock seconds for the ambient shaders; frozen scenes keep a still frame. */
  elapsed: number;
  isPlaying: boolean;
  cameraMode: CameraMode;
  /** Manual silver-nitrate filter, independent of Act I's automatic opening. */
  isNitrateForced: boolean;
  heroConfig: HeroTitleConfig;
  frameStyle: FrameStyle;
  screenBorderStyle: Required<ScreenBorderStyle>;
  isBorderEnabled: boolean;
  /** `?freezeAt=` — a test affordance; frozen scenes do not advance. */
  freezeAt: number | null;
  /**
   * Bumped on every surface-style change. Card rigs coalesce their geometry
   * rebuilds to one per frame off this counter, as `scheduleFrameRebuild` did.
   */
  frameStyleVersion: number;
  /** Bumped per orbit hand-off, so a repeat request still moves the camera. */
  orbitFocusNonce: number;
  /** The chapter the last orbit hand-off asked for. */
  orbitTargetChapter: number;
}

export interface PremiereSceneActions {
  setTime(seconds: number): void;
  setPlaying(playing: boolean): void;
  /** Returns the state it just applied. */
  togglePlaying(): boolean;
  jumpToChapter(index: number): void;
  setCameraMode(mode: CameraMode): void;
  setNitrateMode(enabled: boolean): void;
  setHeroTitle(config: HeroTitleConfig): void;
  setFrameStyle(style: FrameStyle): void;
  setScreenBorderStyle(style: ScreenBorderStyle): void;
  setScreenBorderEnabled(enabled: boolean): void;
  /** One frame: sequence time (while playing) and the ambient shader clock. */
  advance(deltaSeconds: number): void;
}

export type PremiereStore = StoreApi<PremiereSceneState & PremiereSceneActions>;

export interface PremiereStoreOptions {
  freezeAt?: number | null;
  heroConfig?: HeroTitleConfig;
  frameStyle?: FrameStyle;
  screenBorderStyle?: ScreenBorderStyle;
  isBorderEnabled?: boolean;
}

/** A fresh store. One per mounted stage; the config carries over from the URL. */
export function createPremiereStore(options: PremiereStoreOptions = {}): PremiereStore {
  const freezeAt = options.freezeAt ?? null;
  const frozen = freezeAt !== null;

  return createStore<PremiereSceneState & PremiereSceneActions>()((set, get) => ({
    currentTime: frozen ? clampSequenceTime(freezeAt) : 0,
    // A frozen frame's shader clock starts where it was frozen, exactly as the manager's
    // `elapsed = freezeAt ?? clock.elapsedTime` did.
    elapsed: freezeAt ?? 0,
    isPlaying: !frozen,
    cameraMode: 'cinema',
    isNitrateForced: false,
    heroConfig: { ...(options.heroConfig ?? DEFAULT_HERO_TITLE) },
    frameStyle: clampFrameStyle(options.frameStyle ?? DEFAULT_FRAME_STYLE),
    screenBorderStyle: clampScreenBorderStyle(options.screenBorderStyle ?? DEFAULT_SCREEN_BORDER_STYLE),
    isBorderEnabled: options.isBorderEnabled ?? false,
    freezeAt,
    frameStyleVersion: 0,
    orbitFocusNonce: 0,
    orbitTargetChapter: 0,

    setTime: (seconds) => set({ currentTime: clampSequenceTime(seconds) }),

    setPlaying: (playing) => set({ isPlaying: playing }),

    togglePlaying: () => {
      const isPlaying = !get().isPlaying;
      set({ isPlaying });
      return isPlaying;
    },

    jumpToChapter: (index) => {
      const chapter = clampChapterIndex(index);
      const mode = get().cameraMode;
      set({
        currentTime: chapterJumpTime(chapter),
        orbitTargetChapter: chapter,
        orbitFocusNonce: mode === 'orbit' ? get().orbitFocusNonce + 1 : get().orbitFocusNonce,
      });
    },

    setCameraMode: (mode) =>
      set((state) =>
        mode === 'orbit'
          ? {
              cameraMode: mode,
              // Orbiting starts from the act that is on screen, framed properly.
              orbitTargetChapter: chapterOf(state.currentTime),
              orbitFocusNonce: state.orbitFocusNonce + 1,
            }
          : { cameraMode: mode }
      ),

    setNitrateMode: (enabled) => set({ isNitrateForced: enabled }),

    setHeroTitle: (config) => set({ heroConfig: { ...config } }),

    setFrameStyle: (style) =>
      set((state) => ({
        frameStyle: clampFrameStyle(style),
        frameStyleVersion: state.frameStyleVersion + 1,
      })),

    setScreenBorderStyle: (style) =>
      set((state) => ({
        screenBorderStyle: clampScreenBorderStyle(style),
        frameStyleVersion: state.frameStyleVersion + 1,
      })),

    setScreenBorderEnabled: (enabled) => set({ isBorderEnabled: enabled }),

    advance: (deltaSeconds) =>
      set((state) => {
        return {
          currentTime: advanceClock(
            { time: state.currentTime, isPlaying: state.isPlaying },
            deltaSeconds,
            state.freezeAt !== null
          ),
          elapsed: advanceElapsed(state.elapsed, deltaSeconds, state.freezeAt),
        };
      }),
  }));
}

/** The chapter a time belongs to; `activeChapterIndex` is pure, no `three` involved. */
const chapterOf = (time: number): number => activeChapterIndex(time, SEQUENCE_CHAPTERS);
