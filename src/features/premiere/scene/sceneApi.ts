import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';
import type { CameraMode, HeroTitleConfig } from '../model/types';

export interface PlaybackTelemetry {
  currentTime: number;
  activeChapterIndex: number;
  isPlaying: boolean;
}

/**
 * The typed port between React HUD/hooks and whichever renderer owns the
 * title sequence (ADDENDUM-022 §0.3). Hooks depend on this, never on a
 * concrete scene manager or store.
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
}
