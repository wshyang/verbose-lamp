import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';
import type { CameraMode, HeroTitleConfig } from '../model/types';

/** What the scene tells the HUD each frame. */
export interface PlaybackTelemetry {
  currentTime: number;
  activeChapterIndex: number;
  isPlaying: boolean;
}

/**
 * The typed contract between React and the scene (CLAUDE.md §5, ADDENDUM-022 §0.3).
 * Both renderers — the imperative manager and the React Three Fiber scene — satisfy
 * it, and no hook may reach past it into a renderer's internals.
 */
export interface PremiereSceneApi {
  updateHeroTitle(config: HeroTitleConfig): void;
  jumpToChapter(index: number): void;
  setTime(t: number): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): boolean;
  setCameraMode(mode: CameraMode): void;
  setNitrateMode(enabled: boolean): void;
  setSequenceFrameStyle(style: FrameStyle): void;
  setScreenBorderStyle(style: ScreenBorderStyle): void;
  setScreenBorderEnabled(enabled: boolean): void;
}

/** Options both renderers accept from the host. */
export interface PremiereSceneOptions {
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  /** Pin the sequence to one frame for reproducible screenshots (see `model/freeze.ts`). */
  freezeAt?: number;
}
