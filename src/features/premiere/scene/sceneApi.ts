import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';
import type { CameraMode, HeroTitleConfig } from '../model/types';

/**
 * The typed port every premiere renderer must satisfy (ADDENDUM-022 §0.3,
 * CLAUDE.md §5). React hooks depend on this interface, never on a concrete
 * scene class, so the imperative Three.js manager today — and a store-backed
 * renderer tomorrow — are interchangeable behind the same calls. It includes
 * the three FrameStudioTarget operations the Frame Studio drives.
 */
export interface PremiereSceneApi {
  updateHeroTitle: (config: HeroTitleConfig) => void;
  jumpToChapter: (index: number) => void;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => boolean;
  setCameraMode: (mode: CameraMode) => void;
  setNitrateMode: (enabled: boolean) => void;
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

/** Playback state the renderer reports to the HUD, throttled at the source. */
export interface PlaybackTelemetry {
  currentTime: number;
  activeChapterIndex: number;
  isPlaying: boolean;
}
