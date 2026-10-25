import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';
import type { CameraMode, HeroTitleConfig } from '../model/types';

/**
 * The typed port between React and the WebGL scene (CLAUDE.md §5). Hooks depend on this
 * interface, never on a concrete renderer, so the imperative manager and the React Three
 * Fiber store-backed scene are interchangeable (ADDENDUM-022 §2.4). Shape from PR #6.
 */
export interface PremiereSceneApi {
  updateHeroTitle(config: HeroTitleConfig): void;
  jumpToChapter(index: number): void;
  setTime(seconds: number): void;
  setPlaying(playing: boolean): void;
  /** Returns the state it just applied. */
  togglePlaying(): boolean;
  setCameraMode(mode: CameraMode): void;
  setNitrateMode(enabled: boolean): void;
  setSequenceFrameStyle(style: FrameStyle): void;
  setScreenBorderStyle(style: ScreenBorderStyle): void;
  setScreenBorderEnabled(enabled: boolean): void;
  dispose(): void;
}

/**
 * The three surface-style operations Frame Studio binds to. A `Pick`, not an inheritance
 * from the frame-studio feature's own target type (PR #3), so the premiere stays free of
 * that import. `sceneApi.test.ts` keeps the two structurally identical.
 */
export type FrameStudioScenePort = Pick<
  PremiereSceneApi,
  'setSequenceFrameStyle' | 'setScreenBorderStyle' | 'setScreenBorderEnabled'
>;

export interface PlaybackTelemetry {
  currentTime: number;
  activeChapterIndex: number;
  isPlaying: boolean;
}

/** What a scene reports back to React. Both are optional. */
export interface SceneCallbacks {
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
}
