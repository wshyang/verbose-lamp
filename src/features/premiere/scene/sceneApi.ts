import type { FrameStudioTarget } from '@/features/frame-studio';
import type { CameraMode, HeroTitleConfig } from '../model/types';

/**
 * The scene surface React is allowed to call. Hooks depend on this interface, not
 * on the concrete Three.js manager, so a host (or a test double) can supply any
 * implementation (CLAUDE.md §5, ADDENDUM-022 §4.0.3).
 */
export interface PremiereSceneApi extends FrameStudioTarget {
  updateHeroTitle(config: HeroTitleConfig): void;
  jumpToChapter(index: number): void;
  setTime(seconds: number): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): boolean;
  setCameraMode(mode: CameraMode): void;
  setNitrateMode(enabled: boolean): void;
  dispose(): void;
}

export interface PlaybackTelemetry {
  currentTime: number;
  activeChapterIndex: number;
  isPlaying: boolean;
}

export interface SceneManagerOptions {
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  /** Test affordance: hold one frame and stop advancing (ADDENDUM-022 §4.0.2). */
  freezeAt?: number;
}
