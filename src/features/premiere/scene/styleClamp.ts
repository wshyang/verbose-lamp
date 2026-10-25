import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { clamp, type ChapterTiming } from './choreography';

/**
 * Every clamp the premiere applies to a caller's playback request, in one pure place
 * (ADDENDUM-022 §2.1). The React Three Fiber store goes through here, so the transport cannot
 * disagree with itself about what a legal playback time or chapter is. What a legal frame style
 * or screen border is belongs to `art-deco-frame` (`normalizeFrameStyle`), not to the premiere.
 *
 * One deliberate difference from the shipped inline clamps: `THREE.MathUtils.clamp`
 * passes NaN straight through, and a NaN time then read as "the finale" while a NaN
 * chapter index indexed an undefined chapter. A NaN here falls back to a safe default.
 */

/** The transport never sits exactly on the end: 0.001 s short keeps the last act active. */
export const LAST_FRAME_EPSILON = 0.001;

/** `jumpToChapter` lands just inside the card, so its frame is already drawing. */
export const CHAPTER_JUMP_OFFSET = 0.15;

/** `clamp` that answers `fallback` for NaN instead of passing it through. */
function clampOr(value: number, low: number, high: number, fallback: number): number {
  return Number.isNaN(value) ? fallback : clamp(value, low, high);
}

export function clampSequenceTime(seconds: number): number {
  return clampOr(seconds, 0, TOTAL_SEQUENCE_DURATION - LAST_FRAME_EPSILON, 0);
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
