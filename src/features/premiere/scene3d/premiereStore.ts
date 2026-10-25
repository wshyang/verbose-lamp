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
import type { PlaybackTelemetry, PremiereSceneApi } from '../scene/sceneApi';
import { activeChapterIndex } from '../scene/choreography';
import { ORBIT_HOLD_TARGET, planOrbitFocus } from '../scene/orbitFocus';
import {
  chapterEntryTime,
  clampFrameStyle,
  clampScreenBorderStyle,
  clampSequenceTime,
} from '../scene/styleClamp';

/** The scene's state, held once so the R3F components can subscribe instead of prop-drilling. */
export interface PremiereState {
  currentTime: number;
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNitrateForced: boolean;
  heroConfig: HeroTitleConfig;
  frameStyle: FrameStyle;
  screenBorderStyle: ScreenBorderStyle;
  isBorderEnabled: boolean;
  /** Non-null only under the screenshot affordance: hold this time and never advance. */
  freezeAt: number | null;

  setTime: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => boolean;
  jumpToChapter: (index: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setNitrateMode: (enabled: boolean) => void;
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
  updateHeroTitle: (config: HeroTitleConfig) => void;

  /** Wiring callbacks, set once at creation. */
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  onFrameReady?: () => void;
}

export type PremiereStore = StoreApi<PremiereState>;

export interface PremiereStoreOptions {
  freezeAt?: number | null;
  heroConfig?: HeroTitleConfig;
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  onFrameReady?: () => void;
}

function initialFrameStyle(): FrameStyle {
  return {
    intricacy: DEFAULT_FRAME_STYLE.intricacy,
    formula: { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME } },
  };
}

/**
 * The premiere's scene state (ADDENDUM-022 §6.1). Vanilla zustand: no provider, no React
 * requirement, so the store is testable on its own and `storeSceneApi()` keeps the existing
 * hooks untouched.
 */
export function createPremiereStore(options: PremiereStoreOptions = {}): PremiereStore {
  const freezeAt = options.freezeAt ?? null;
  return createStore<PremiereState>()((set, get) => ({
    currentTime: freezeAt ?? 0,
    isPlaying: freezeAt === null,
    cameraMode: 'cinema',
    isNitrateForced: false,
    heroConfig: { ...(options.heroConfig ?? DEFAULT_HERO_TITLE) },
    frameStyle: initialFrameStyle(),
    screenBorderStyle: { ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...DEFAULT_SCREEN_BORDER_STYLE.genome } },
    isBorderEnabled: false,
    freezeAt,

    setTime: (seconds) => set({ currentTime: clampSequenceTime(seconds, TOTAL_SEQUENCE_DURATION) }),

    setPlaying: (playing) => set({ isPlaying: playing }),

    togglePlaying: () => {
      const next = !get().isPlaying;
      set({ isPlaying: next });
      return next;
    },

    jumpToChapter: (index) => {
      const clamped = Math.max(0, Math.min(SEQUENCE_CHAPTERS.length - 1, index));
      const chapter = SEQUENCE_CHAPTERS[clamped];
      if (get().cameraMode === 'orbit') {
        // An orbit visit always opens on the hold, never on the fade-in at the act's edge.
        const hold =
          chapter.startTime + (chapter.endTime - chapter.startTime) * ORBIT_HOLD_TARGET;
        set({ currentTime: clampSequenceTime(hold, TOTAL_SEQUENCE_DURATION), isPlaying: false });
        return;
      }
      set({
        currentTime: clampSequenceTime(chapterEntryTime(chapter.startTime), TOTAL_SEQUENCE_DURATION),
        isPlaying: get().isPlaying,
      });
    },

    setCameraMode: (mode) => {
      set({ cameraMode: mode });
      if (mode !== 'orbit') return;
      // The orbit camera always opens on the hold, not on a fade or a fly-through.
      const plan = planOrbitFocus(
        SEQUENCE_CHAPTERS,
        activeChapterIndex(get().currentTime, SEQUENCE_CHAPTERS),
        get().currentTime,
      );
      if (plan.seekTime !== null) {
        set({ currentTime: clampSequenceTime(plan.seekTime, TOTAL_SEQUENCE_DURATION), isPlaying: false });
      }
    },

    setNitrateMode: (enabled) => set({ isNitrateForced: enabled }),

    setSequenceFrameStyle: (style) => set({ frameStyle: clampFrameStyle(style) }),

    setScreenBorderStyle: (style) => set({ screenBorderStyle: clampScreenBorderStyle(style) }),

    setScreenBorderEnabled: (enabled) => set({ isBorderEnabled: enabled }),

    updateHeroTitle: (config) => set({ heroConfig: { ...config } }),

    onTelemetry: options.onTelemetry,
    onChapterChange: options.onChapterChange,
    onFrameReady: options.onFrameReady,
  }));
}

/**
 * Presents the store as the scene surface the hooks already speak, so
 * `usePremiereTransport`, `usePremiereSceneOptions` and `useFrameStudio` need no change.
 */
export function storeSceneApi(store: PremiereStore): PremiereSceneApi {
  const state = () => store.getState();
  return {
    setTime: (seconds) => state().setTime(seconds),
    setPlaying: (playing) => state().setPlaying(playing),
    togglePlaying: () => state().togglePlaying(),
    jumpToChapter: (index) => state().jumpToChapter(index),
    setCameraMode: (mode) => state().setCameraMode(mode),
    setNitrateMode: (enabled) => state().setNitrateMode(enabled),
    setSequenceFrameStyle: (style) => state().setSequenceFrameStyle(style),
    setScreenBorderStyle: (style) => state().setScreenBorderStyle(style),
    setScreenBorderEnabled: (enabled) => state().setScreenBorderEnabled(enabled),
    updateHeroTitle: (config) => state().updateHeroTitle(config),
    dispose: () => state().setPlaying(false),
  };
}
