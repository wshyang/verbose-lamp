export { SpectacleProvider, useSpectacle } from './hooks/SpectacleProvider';
export { useReducedMotion } from '@/shared/hooks/useReducedMotion';
export { MarqueeBorder } from './components/MarqueeBorder';
export { pointFromElement, rectFromElement } from './model/geometry';
export { canRenderInDecoGlyphs } from './model/decoGlyphs';
export { chasePattern, type ChaseMode } from './model/chasePattern';
export type {
  EffectHandle,
  EffectId,
  EffectParamsMap,
  NormPoint,
  NormRect,
  QualityTier,
  SparklerParams,
  SpectacleStage,
} from './model/types';