import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  SIGNATURE_GENOME,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS } from '../data/sequence';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import { activeChapterIndex } from '../scene/choreography';
import { orbitFocusFor } from '../scene/orbitFocus';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import {
  clampFrameStyle,
  clampScreenBorderStyle,
  clampTime,
  jumpTimeForChapter,
} from '../scene/styleClamp';

export interface PremiereCallbacks {
  onTelemetry: (telemetry: PlaybackTelemetry) => void;
  onChapterChange: (chapterIndex: number) => void;
}

export interface PremiereStoreOptions {
  freezeAt: number | null;
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
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
  frameReady: boolean;
  callbacks: PremiereCallbacks;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => boolean;
  jumpToChapter: (index: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setNitrateMode: (enabled: boolean) => void;
  updateHeroTitle: (config: HeroTitleConfig) => void;
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
  markFrameReady: () => void;
}

export type PremiereStore = StoreApi<PremiereState>;

const initialFrameStyle = (): FrameStyle => ({
  intricacy: DEFAULT_FRAME_STYLE.intricacy,
  formula: {
    ...DEFAULT_FRAME_STYLE.formula,
    genome: { ...SIGNATURE_GENOME },
    layers: DEFAULT_FRAME_STYLE.formula.layers?.map((layer) => ({ ...layer })),
  },
});

function focusOrbit(state: PremiereState, index: number): Partial<PremiereState> {
  // Callers pass a clamped chapter index (jumpToChapter / activeChapterIndex).
  const chapter = SEQUENCE_CHAPTERS[index];
  const focus = orbitFocusFor({ chapter, currentTime: state.currentTime });
  return focus.advanceToTime === null
    ? {}
    : { currentTime: focus.advanceToTime, isPlaying: false };
}

/** Vanilla Zustand store: readable inside `useFrame` without re-rendering React. */
export function createPremiereStore(options: PremiereStoreOptions): PremiereStore {
  return createStore<PremiereState>()((set, get) => ({
    currentTime: options.freezeAt ?? 0,
    isPlaying: options.freezeAt === null,
    cameraMode: 'cinema',
    isNitrateForced: false,
    heroConfig: { ...DEFAULT_HERO_TITLE },
    frameStyle: initialFrameStyle(),
    borderStyle: { ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } },
    isBorderEnabled: false,
    freezeAt: options.freezeAt,
    frameReady: false,
    callbacks: {
      onTelemetry: options.onTelemetry ?? (() => undefined),
      onChapterChange: options.onChapterChange ?? (() => undefined),
    },
    setTime: (time) => set({ currentTime: clampTime(time) }),
    setPlaying: (playing) => set({ isPlaying: playing }),
    togglePlaying: () => {
      const next = !get().isPlaying;
      set({ isPlaying: next });
      return next;
    },
    jumpToChapter: (index) => {
      const state = get();
      set({ currentTime: jumpTimeForChapter({ index, chapters: SEQUENCE_CHAPTERS }) });
      if (state.cameraMode !== 'orbit') return;
      const clamped = Math.max(0, Math.min(SEQUENCE_CHAPTERS.length - 1, Math.trunc(index)));
      set(focusOrbit(get(), clamped));
    },
    setCameraMode: (mode) => {
      if (mode === 'cinema') {
        set({ cameraMode: mode });
        return;
      }
      const state = get();
      const index = activeChapterIndex({ time: state.currentTime, chapters: SEQUENCE_CHAPTERS });
      set({ cameraMode: mode, ...focusOrbit(state, index) });
    },
    setNitrateMode: (enabled) => set({ isNitrateForced: enabled }),
    updateHeroTitle: (config) => set({ heroConfig: { ...config } }),
    setSequenceFrameStyle: (style) => set({ frameStyle: clampFrameStyle(style) }),
    setScreenBorderStyle: (style) => set({ borderStyle: clampScreenBorderStyle(style) }),
    setScreenBorderEnabled: (enabled) => set({ isBorderEnabled: enabled }),
    markFrameReady: () => set({ frameReady: true }),
  }));
}
