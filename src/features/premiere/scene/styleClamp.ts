import {
  clampGenome,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import type { ChapterTiming } from './choreography';

/**
 * The clamping the scene applies to every externally supplied value
 * (ADDENDUM-022 §2.1). Pure: returns new objects, never mutates the input.
 */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const clampLevel = (level: number): number => clamp(Math.round(level), 1, 4);

export function clampTime(time: number, duration: number = TOTAL_SEQUENCE_DURATION): number {
  return clamp(time, 0, duration - 0.001);
}

export function clampChapterIndex(index: number, count: number): number {
  return clamp(Math.trunc(index), 0, count - 1);
}

export interface JumpQuery {
  index: number;
  chapters: readonly ChapterTiming[];
}

/** Chapter jumps land 0.15 s in, so the card is already drawing on. */
export function jumpTimeForChapter({ index, chapters }: JumpQuery): number {
  return chapters[clampChapterIndex(index, chapters.length)].startTime + 0.15;
}

export function clampFrameStyle(style: FrameStyle): FrameStyle {
  return {
    intricacy: clamp(style.intricacy, 0, 1),
    formula: {
      source: style.formula.source,
      level: clampLevel(style.formula.level),
      genome: clampGenome(style.formula.genome),
      seed: style.formula.seed,
      layers: (style.formula.layers ?? []).map((layer) => ({
        source: layer.source,
        enabled: layer.enabled,
        level: clampLevel(layer.level),
      })),
    },
  };
}

export function clampScreenBorderStyle(style: ScreenBorderStyle): ScreenBorderStyle {
  return {
    weight: clamp(style.weight, 0, 1),
    genome: clampGenome(style.genome),
    pattern: style.pattern,
  };
}
