import type { GildingParams } from '@/features/gilded-portrait';

/**
 * Tone controls for the "Gild subject" finish, lifted from implementation C (ADDENDUM-019):
 * its standout gold came from exposing the full gilding pipeline, not one fixed preset.
 * Slider units match the Gilded Portrait studio (clarity in percent).
 */
export type GildingToneKey = 'clarity' | 'levels' | 'folds';

export interface GildingToneRange {
  readonly key: GildingToneKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** Slider units per parameter unit. */
  readonly scale: number;
}

export const GILDING_TONE_RANGES: readonly GildingToneRange[] = Object.freeze([
  { key: 'clarity', label: 'Clarity', min: 0, max: 160, scale: 100 },
  { key: 'levels', label: 'Levels', min: 0, max: 100, scale: 1 },
  { key: 'folds', label: 'Specular folds', min: 0, max: 4, scale: 1 },
]);

export function gildingSliderValue(params: GildingParams, range: GildingToneRange): number {
  return Math.round(params[range.key] * range.scale);
}

/** One tone moved, clamped to the studio range; never mutates the input. */
export function withGildingTone(params: GildingParams, change: { key: GildingToneKey; sliderValue: number }): GildingParams {
  const range = GILDING_TONE_RANGES.find((candidate) => candidate.key === change.key);
  if (range === undefined || !Number.isFinite(change.sliderValue)) return params;
  const slider = Math.min(range.max, Math.max(range.min, Math.round(change.sliderValue)));
  return { ...params, [change.key]: slider / range.scale };
}
