import { activeChapterIndex, type ChapterTiming } from './choreography';

/**
 * Orbit camera framing, lifted out of the imperative scene manager's `focusOrbitOnChapter()` (ADDENDUM-027)
 * (ADDENDUM-022 §6.2). Pure so the camera component and its test share one answer.
 */

export interface OrbitPlan {
  /** Where to put the camera (world units). */
  readonly camera: readonly [number, number, number];
  /** What the orbit controls should look at. */
  readonly target: readonly [number, number, number];
  /** Seek to this time first, or null to leave the playhead alone. */
  readonly seekTime: number | null;
}

/** The hold window an orbit visit is allowed to keep: outside it, the playhead is nudged in. */
export const ORBIT_HOLD_START = 0.42;
export const ORBIT_HOLD_END = 0.85;
/** …and the fraction of the act it is nudged to. */
export const ORBIT_HOLD_TARGET = 0.56;

export function planOrbitFocus(
  chapters: readonly ChapterTiming[],
  chapterIndex: number,
  currentTime: number,
): OrbitPlan {
  const chapter = chapters[chapterIndex] ?? chapters[chapters.length - 1];
  const duration = chapter.endTime - chapter.startTime;
  const local = (currentTime - chapter.startTime) / duration;
  const seekTime =
    local < ORBIT_HOLD_START || local > ORBIT_HOLD_END
      ? chapter.startTime + duration * ORBIT_HOLD_TARGET
      : null;
  return {
    camera: [2.4, 0.9, chapter.zPosition + 9.2],
    target: [0, 0, chapter.zPosition],
    seekTime,
  };
}

/** The chapter an orbit visit should frame, for a playhead anywhere (including NaN). */
export function orbitChapterIndex(chapters: readonly ChapterTiming[], currentTime: number): number {
  return activeChapterIndex(currentTime, chapters);
}
