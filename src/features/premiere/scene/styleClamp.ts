import {
  clampGenome,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * The premiere's defensive style/time clamping, extracted verbatim from
 * GatsbySceneManager's setters (ADDENDUM-022 §2.1) so the imperative
 * manager and the R3F store sanitise inputs identically. Pure: every
 * function returns a fresh value and never mutates its input.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSeed(seed: number | undefined): number | undefined {
  return seed === undefined ? undefined : Math.max(0, Math.round(seed));
}

function clampLevel(level: number): number {
  return clamp(Math.round(level), 1, 4);
}

export function clampFrameStyle(style: FrameStyle): FrameStyle {
  return {
    intricacy: clamp(style.intricacy, 0, 1),
    formula: {
      source: style.formula.source,
      level: clampLevel(style.formula.level),
      seed: clampSeed(style.formula.seed),
      genome: clampGenome(style.formula.genome),
      layers:
        style.formula.layers?.map((layer) => ({
          source: layer.source,
          enabled: layer.enabled,
          level: clampLevel(layer.level),
        })) ?? [],
    },
  };
}

export function clampScreenBorderStyle(style: ScreenBorderStyle): ScreenBorderStyle {
  return {
    weight: clamp(style.weight, 0, 1),
    genome: clampGenome(style.genome),
    pattern: style.pattern ?? 'poster',
    seed: clampSeed(style.seed),
  };
}

export function clampSequenceTime(time: number): number {
  return clamp(time, 0, TOTAL_SEQUENCE_DURATION - 0.001);
}

export interface ChapterJumpTarget {
  index: number;
  time: number;
}

/** Where a chapter jump lands: the clamped index, 0.15 s into the chapter. */
export function chapterJumpTarget(
  index: number,
  chapters: readonly { startTime: number }[],
): ChapterJumpTarget {
  const clamped = Math.max(0, Math.min(chapters.length - 1, index));
  return { index: clamped, time: chapters[clamped].startTime + 0.15 };
}
