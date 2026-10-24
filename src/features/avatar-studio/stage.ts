import type { StageFacts, StudioStage } from './types';

/**
 * The studio's session stage, derived (never stored) from what is known. Ported from the
 * reference `usePhotoSession` machine: idle → working → refining → ready / plain /
 * cropping / failed. Face detection and segmentation are independent; either can fail
 * without stopping the other (reference ADR-054).
 */
export function nextStage(facts: StageFacts): StudioStage {
  if (facts.error !== null) return 'failed';
  if (!facts.hasImage) return facts.isLocating ? 'working' : 'idle';
  if (facts.isLocating) return 'working';
  if (facts.crop === null) return 'cropping';
  if (facts.isSegmenting) return 'refining';
  return facts.matte === null ? 'plain' : 'ready';
}

/** User-facing hint per stage. Plain words only: no library, model or file names (CLAUDE.md §5). */
export const STAGE_HINTS: Readonly<Record<StudioStage, string>> = Object.freeze({
  idle: 'Choose a portrait, or try Wei_Ling. Your photo never leaves this browser.',
  working: 'Finding the face…',
  refining: 'Face found. Lifting the background…',
  ready: 'Background removed. Move the square if the framing is off.',
  plain: 'The background could not be removed here — showing the full photo.',
  cropping: 'We could not find a face. Place the square over it.',
  failed: 'That image could not be used. Try a different photo.',
});

export function stageHint(stage: StudioStage): string {
  return STAGE_HINTS[stage];
}

/** True while background work is running, so controls can show a gentle busy state. */
export function isStageBusy(stage: StudioStage): boolean {
  return stage === 'working' || stage === 'refining';
}
