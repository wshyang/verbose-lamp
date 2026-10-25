import { describe, expectTypeOf, it } from 'vitest';
import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';
import type { CameraMode, HeroTitleConfig } from '../model/types';
import type {
  PlaybackTelemetry,
  PremiereSceneApi,
  SceneCallbacks,
} from './sceneApi';

// These are compile-time contracts: `tsc --noEmit` is what fails when one is broken,
// and Vitest's expectTypeOf makes each one a named, reviewable assertion.
describe('PremiereSceneApi', () => {
  it('exposes every operation the premiere hooks call', () => {
    expectTypeOf<PremiereSceneApi['updateHeroTitle']>().toEqualTypeOf<(config: HeroTitleConfig) => void>();
    expectTypeOf<PremiereSceneApi['jumpToChapter']>().toEqualTypeOf<(index: number) => void>();
    expectTypeOf<PremiereSceneApi['setTime']>().toEqualTypeOf<(seconds: number) => void>();
    expectTypeOf<PremiereSceneApi['setPlaying']>().toEqualTypeOf<(playing: boolean) => void>();
    expectTypeOf<PremiereSceneApi['setCameraMode']>().toEqualTypeOf<(mode: CameraMode) => void>();
    expectTypeOf<PremiereSceneApi['setNitrateMode']>().toEqualTypeOf<(enabled: boolean) => void>();
    expectTypeOf<PremiereSceneApi['setSequenceFrameStyle']>().toEqualTypeOf<(style: FrameStyle) => void>();
    expectTypeOf<PremiereSceneApi['setScreenBorderStyle']>().toEqualTypeOf<(style: ScreenBorderStyle) => void>();
    expectTypeOf<PremiereSceneApi['setScreenBorderEnabled']>().toEqualTypeOf<(enabled: boolean) => void>();
    expectTypeOf<PremiereSceneApi['dispose']>().toEqualTypeOf<() => void>();
  });

  it('reports the state a toggle just applied', () => {
    expectTypeOf<PremiereSceneApi['togglePlaying']>().toEqualTypeOf<() => boolean>();
  });
});

describe('PlaybackTelemetry and SceneCallbacks', () => {
  it('carries the playhead, the active chapter and the transport state', () => {
    expectTypeOf<PlaybackTelemetry>().toEqualTypeOf<{
      currentTime: number;
      activeChapterIndex: number;
      isPlaying: boolean;
    }>();
  });

  it('makes both callbacks optional', () => {
    expectTypeOf<SceneCallbacks>().toEqualTypeOf<{
      onTelemetry?: (telemetry: PlaybackTelemetry) => void;
      onChapterChange?: (chapterIndex: number) => void;
    }>();
    expectTypeOf<Record<string, never>>().toExtend<SceneCallbacks>();
  });
});
