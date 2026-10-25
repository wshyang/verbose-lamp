import {
  clampGenome,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { clamp, type ChapterTiming } from './choreography';

/**
 * Every clamp the premiere applies to a caller's request, in one pure place
 * (ADDENDUM-022 §2.1). The scene manager and the React Three Fiber store both go through
 * here, so the two renderers cannot drift apart on what a legal frame style, screen
 * border or playback time is.
 *
 * One deliberate difference from the shipped inline clamps: `THREE.MathUtils.clamp`
 * passes NaN straight through, and a NaN time then read as "the finale" while a NaN
 * chapter index indexed an undefined chapter. A NaN here falls back to a safe default.
 */

/** The transport never sits exactly on the end: 0.001 s short keeps the last act active. */
export const LAST_FRAME_EPSILON = 0.001;

/** `jumpToChapter` lands just inside the card, so its frame is already drawing. */
export const CHAPTER_JUMP_OFFSET = 0.15;

const MIN_FORMULA_LEVEL = 1;
const MAX_FORMULA_LEVEL = 4;

/** `clamp` that answers `fallback` for NaN instead of passing it through. */
function clampOr(value: number, low: number, high: number, fallback: number): number {
  return Number.isNaN(value) ? fallback : clamp(value, low, high);
}

export function clampSequenceTime(seconds: number): number {
  return clampOr(seconds, 0, TOTAL_SEQUENCE_DURATION - LAST_FRAME_EPSILON, 0);
}

export function clampIntricacy(intricacy: number): number {
  return clampOr(intricacy, 0, 1, DEFAULT_FRAME_STYLE.intricacy);
}

/** Formula levels are whole numbers 1…4; a slider can hand over anything. */
export function clampFormulaLevel(level: number): number {
  return clampOr(Math.round(level), MIN_FORMULA_LEVEL, MAX_FORMULA_LEVEL, MIN_FORMULA_LEVEL);
}

export function clampChapterIndex(index: number): number {
  return clampOr(Math.round(index), 0, SEQUENCE_CHAPTERS.length - 1, 0);
}

export interface ChapterJumpTarget {
  readonly index: number;
  readonly time: number;
}

/** The chapter a jump resolves to, and the time it lands on (just inside the card). */
export function chapterJumpTarget(
  index: number,
  chapters: readonly ChapterTiming[],
): ChapterJumpTarget {
  const resolved = Math.min(clampChapterIndex(index), chapters.length - 1);
  return { index: resolved, time: chapters[resolved].startTime + CHAPTER_JUMP_OFFSET };
}

export function clampFrameStyle(style: FrameStyle): FrameStyle {
  const { formula } = style;
  return {
    intricacy: clampIntricacy(style.intricacy),
    formula: {
      source: formula.source,
      level: clampFormulaLevel(formula.level),
      genome: clampGenome(formula.genome),
      ...(formula.seed === undefined ? {} : { seed: formula.seed }),
      layers: (formula.layers ?? []).map((layer) => ({
        source: layer.source,
        enabled: layer.enabled,
        level: clampFormulaLevel(layer.level),
      })),
    },
  };
}

/**
 * Only `weight` and `genome` are this module's to clamp. Everything else passes through,
 * so the lattice `pattern` and `seed` (which select the proscenium) cannot be dropped by
 * a clamp that predates them.
 */
export function clampScreenBorderStyle(style: ScreenBorderStyle): ScreenBorderStyle {
  return {
    ...style,
    weight: clampOr(style.weight, 0, 1, DEFAULT_SCREEN_BORDER_STYLE.weight),
    genome: clampGenome(style.genome),
  };
}
