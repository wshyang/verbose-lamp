export { DEFAULT_HERO_TITLE, SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from './data/sequence';
export type { CameraMode, HeroTitleConfig, SequenceChapter } from './model/types';
export { usePremiereController } from './hooks/usePremiereController';
export { usePremiereShortcuts } from './hooks/usePremiereShortcuts';
export type { PremiereRuntime } from './hooks/usePremiereRuntime';
export type { PremiereSceneApi, PlaybackTelemetry } from './scene/sceneApi';
export { PremiereCanvas } from './scene3d';