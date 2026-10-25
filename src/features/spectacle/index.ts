export { SpectacleProvider, useSpectacle } from './hooks/SpectacleProvider';
export { useReducedMotion } from '@/shared/hooks/useReducedMotion';
export { MarqueeBorder } from './components/MarqueeBorder';
export { pointFromElement, rectFromElement } from './model/geometry';
export { canRenderInDecoGlyphs } from './model/decoGlyphs';
export { chasePattern, type ChaseMode } from './model/chasePattern';
export {
  DEFAULT_WINNER_SUBTITLE,
  playWinnerCelebration,
  winnerCelebration,
  type Winner,
} from './model/winnerCelebration';
export type {
  EffectHandle,
  EffectId,
  EffectParamsMap,
  NormPoint,
  NormRect,
  QualityTier,
  SpectacleStage,
} from './model/types';