import type { ChapterTiming, Vec3 } from './choreography';

/**
 * Orbit-mode framing, extracted from `GatsbySceneManager.focusOrbitOnChapter`
 * (ADDENDUM-022 §2.3) so the React Three Fiber camera reuses the exact numbers and the
 * "advance into the hold" rule can be tested without a canvas.
 *
 * The rule: when the guest switches to orbit near the top or tail of a card, the clock is
 * nudged to the middle of its hold so the whole frame is in view and playback pauses.
 * Inside the window the current time is left alone.
 */

/** Local (0…1) window a card is worth inspecting in. */
export const ORBIT_HOLD_WINDOW = { enter: 0.42, exit: 0.85 } as const;

/** Where the clock is nudged to: the middle of the hold. */
export const ORBIT_HOLD_LOCAL = 0.56;

/** The camera stands off to the side of the card, so its depth reads. */
export const ORBIT_CAMERA_OFFSET = { x: 2.4, y: 0.9, z: 9.2 } as const;

/**
 * Float noise tolerance on the window edges. A time placed exactly on 0.85 of chapters
 * two to four computes to 0.8500000000000001, which the shipped strict comparison read as
 * "outside" and answered by jumping the clock and pausing a guest who was inside the hold.
 */
const HOLD_EPSILON = 1e-9;

/** Position along a chapter, 0 at its first frame and 1 at its last. */
export function chapterLocalTime(time: number, chapter: ChapterTiming): number {
  const span = chapter.endTime - chapter.startTime;
  if (!(span > 0)) return 0;
  return (time - chapter.startTime) / span;
}

/** True when orbiting should advance the clock into the hold first. */
export function shouldAdvanceOrbit(local: number): boolean {
  return local < ORBIT_HOLD_WINDOW.enter - HOLD_EPSILON || local > ORBIT_HOLD_WINDOW.exit + HOLD_EPSILON;
}

/** The time to snap to when a guest orbits a card from outside its hold window. */
export function orbitTimeFor(chapter: ChapterTiming): number {
  return chapter.startTime + (chapter.endTime - chapter.startTime) * ORBIT_HOLD_LOCAL;
}

/** Where the orbit camera stands for a card, relative to that card's Z plane. */
export function orbitCameraPosition(chapter: ChapterTiming): { x: number; y: number; z: number } {
  return {
    x: ORBIT_CAMERA_OFFSET.x,
    y: ORBIT_CAMERA_OFFSET.y,
    z: chapter.zPosition + ORBIT_CAMERA_OFFSET.z,
  };
}

export interface OrbitFocusPlan {
  /** The time to move the clock to, or `null` when the guest is already inside the hold. */
  readonly time: number | null;
  readonly target: Vec3;
  readonly position: Vec3;
}

/** The whole orbit hand-off as data: whether to move the clock, and where to look from. */
export function orbitFocusPlan(time: number, chapter: ChapterTiming): OrbitFocusPlan {
  const position = orbitCameraPosition(chapter);
  return {
    time: shouldAdvanceOrbit(chapterLocalTime(time, chapter)) ? orbitTimeFor(chapter) : null,
    target: [0, 0, chapter.zPosition],
    position: [position.x, position.y, position.z],
  };
}
