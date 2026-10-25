import type { SequenceChapter } from '../model/types';

/**
 * Orbiting targets a chapter's hold, never its fly-through (moved out of
 * `GatsbySceneManager.focusOrbitOnChapter`). Pure, so the rule is testable.
 */
export const ORBIT_HOLD_POINT = 0.56;
/** Outside this window the camera is mid-flight and orbit inspection is useless. */
export const ORBIT_HOLD_WINDOW = { from: 0.42, to: 0.85 } as const;
/** Sampling noise from chapter arithmetic must not read as "mid-flight". */
const WINDOW_EPSILON = 1e-9;

export interface OrbitFocusResult {
  /** Time to move to: the hold point, or the time it was already at. */
  time: number;
  /** True when the caller should pause: it had to move the playhead. */
  pause: boolean;
}

/** Where the playhead must sit for this chapter to be inspectable in orbit. */
export function orbitFocusTime(input: {
  currentTime: number;
  chapter: SequenceChapter;
}): OrbitFocusResult {
  const { currentTime, chapter } = input;
  const duration = chapter.endTime - chapter.startTime;
  const local = (currentTime - chapter.startTime) / duration;
  if (
    local >= ORBIT_HOLD_WINDOW.from - WINDOW_EPSILON &&
    local <= ORBIT_HOLD_WINDOW.to + WINDOW_EPSILON
  ) {
    return { time: currentTime, pause: false };
  }
  return { time: chapter.startTime + duration * ORBIT_HOLD_POINT, pause: true };
}

export type Vec3 = readonly [number, number, number];

export interface OrbitPose {
  position: Vec3;
  target: Vec3;
}

/** Three-quarter view of the card, in front of it. */
export function orbitPose(chapter: SequenceChapter): OrbitPose {
  return {
    position: [2.4, 0.9, chapter.zPosition + 9.2],
    target: [0, 0, chapter.zPosition],
  };
}
