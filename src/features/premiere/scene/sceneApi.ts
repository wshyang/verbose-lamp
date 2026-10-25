import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';
import type { CameraMode, HeroTitleConfig } from '../model/types';

/**
 * The typed port between React and the WebGL scene (CLAUDE.md §5,
 * ADDENDUM-027 §4). Hooks depend on this interface, never on the concrete
 * manager class, so the renderer can be replaced — the React Three Fiber port
 * in ADDENDUM-022 Phase 2 is expected to implement exactly this surface.
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

/** The three surface-style operations Frame Studio binds to. */
export type FrameStudioScenePort = Pick<
  PremiereSceneApi,
  'setSequenceFrameStyle' | 'setScreenBorderStyle' | 'setScreenBorderEnabled'
>;
