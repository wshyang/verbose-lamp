import {
  clampGenome,
  DEFAULT_SCREEN_BORDER_PATTERN,
  DEFAULT_SCREEN_BORDER_SEED,
  type BaseGenome,
  type FrameStyle,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * Every clamp the premiere applies to a caller's request, in one pure place
 * (ADDENDUM-022 §6 step 2.1). `GatsbySceneManager` and the React Three Fiber store
 * both go through here, so the two renderers cannot drift apart on what a legal
 * frame style, screen border or playback time is.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The transport never sits exactly on the end: 0.001 s short keeps the last act active. */
export const LAST_FRAME_EPSILON = 0.001;

/** `jumpToChapter` lands just inside the card, so its frame is already drawing. */
export const CHAPTER_JUMP_OFFSET = 0.15;

export const clampSequenceTime = (seconds: number): number =>
  clamp(seconds, 0, TOTAL_SEQUENCE_DURATION - LAST_FRAME_EPSILON);

export const clampIntricacy = (intricacy: number): number => clamp(intricacy, 0, 1);

/** Formula levels are whole numbers 1…4; a slider can hand over anything. */
export const clampFormulaLevel = (level: number): number =>
  clamp(Math.round(level), 1, 4) as 1 | 2 | 3 | 4;

export const clampChapterIndex = (index: number): number =>
  clamp(Math.round(index), 0, SEQUENCE_CHAPTERS.length - 1);

/** The time `jumpToChapter` reports, measured from the chapter's own start. */
export const chapterJumpTime = (index: number): number =>
  SEQUENCE_CHAPTERS[clampChapterIndex(index)].startTime + CHAPTER_JUMP_OFFSET;

export function clampFrameStyle(style: FrameStyle): FrameStyle {
  const formula = style.formula;
  return {
    intricacy: clampIntricacy(style.intricacy),
    formula: {
      source: formula.source,
      level: clampFormulaLevel(formula.level),
      genome: clampGenome(formula.genome),
      layers:
        formula.layers?.map((layer) => ({
          source: layer.source,
          enabled: layer.enabled,
          level: clampFormulaLevel(layer.level),
        })) ?? [],
    },
  };
}

/**
 * `pattern`/`seed` select the Deco Lattice proscenium (ADDENDUM-021 §3.5); dropping
 * them here would silently pin the rig to the printed poster edge.
 */
export function clampScreenBorderStyle(
  style: ScreenBorderStyle
): Required<ScreenBorderStyle> & { genome: BaseGenome } {
  return {
    weight: clamp(style.weight, 0, 1),
    genome: clampGenome(style.genome),
    pattern: style.pattern ?? DEFAULT_SCREEN_BORDER_PATTERN,
    seed: style.seed ?? DEFAULT_SCREEN_BORDER_SEED,
  };
}
