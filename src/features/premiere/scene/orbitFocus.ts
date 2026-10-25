import { chapterProgress, type ChapterTiming, type Vec3 } from './choreography';

/**
 * Where the orbit camera goes when it focuses a chapter (ADDENDUM-022 §2.3).
 * Outside the card's hold window (local 0.42..0.85) playback first advances
 * into the hold and pauses, exactly as the imperative manager did.
 */

export interface OrbitFocusQuery {
  chapter: ChapterTiming;
  currentTime: number;
}

export interface OrbitFocus {
  cameraPosition: Vec3;
  target: Vec3;
  /** Time to jump to before orbiting, or null to leave playback alone. */
  advanceToTime: number | null;
}

export function orbitFocusFor({ chapter, currentTime }: OrbitFocusQuery): OrbitFocus {
  const local = chapterProgress({ time: currentTime, chapter });
  const duration = chapter.endTime - chapter.startTime;
  const HOLD_EPSILON = 1e-9;
  const outsideHold = local < 0.42 - HOLD_EPSILON || local > 0.85 + HOLD_EPSILON;
  return {
    cameraPosition: [2.4, 0.9, chapter.zPosition + 9.2],
    target: [0, 0, chapter.zPosition],
    advanceToTime: outsideHold ? chapter.startTime + duration * 0.56 : null,
  };
}
