import type { SequenceChapter } from '../model/types';

/**
 * Orbit-mode framing, extracted from `GatsbySceneManager.focusOrbitOnChapter`
 * (ADDENDUM-022 §6 step 2.3) so the React Three Fiber camera can reuse the exact
 * numbers and so the "advance into the hold" rule can be tested without a canvas.
 *
 * The rule: when the guest switches to orbit near the top or tail of a card, the
 * clock is nudged to the middle of its hold so the whole frame is in view. Inside
 * the window the current time is left alone.
 */

/** Local (0…1) window a card is worth inspecting in. */
export const ORBIT_HOLD_WINDOW = { enter: 0.42, exit: 0.85 } as const;

/** Where the clock is nudged to — the middle of the hold. */
export const ORBIT_HOLD_LOCAL = 0.56;

/** The camera stands off to the side of the card, so its depth reads. */
export const ORBIT_CAMERA_OFFSET = { x: 2.4, y: 0.9, z: 9.2 } as const;

/** Position along a chapter, 0 at its first frame and 1 at its last. */
export function chapterLocalTime(time: number, chapter: SequenceChapter): number {
  const span = chapter.endTime - chapter.startTime;
  if (!(span > 0)) return 0;
  return (time - chapter.startTime) / span;
}

/** True when orbiting should advance the clock into the hold first. */
export function shouldAdvanceOrbit(local: number): boolean {
  return local < ORBIT_HOLD_WINDOW.enter || local > ORBIT_HOLD_WINDOW.exit;
}

/** The time to snap to when a guest orbits a card from outside its hold window. */
export function orbitTimeFor(chapter: SequenceChapter): number {
  return chapter.startTime + (chapter.endTime - chapter.startTime) * ORBIT_HOLD_LOCAL;
}

/** Where the orbit camera stands for a card, relative to that card's Z plane. */
export function orbitCameraPosition(chapter: SequenceChapter): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: ORBIT_CAMERA_OFFSET.x,
    y: ORBIT_CAMERA_OFFSET.y,
    z: chapter.zPosition + ORBIT_CAMERA_OFFSET.z,
  };
}

/**
 * The whole orbit hand-off as data: whether to move the clock, and where to look.
 * `null` when the guest is already inside the hold window and nothing should move.
 */
export function orbitFocusPlan(
  time: number,
  chapter: SequenceChapter
): { time: number | null; target: readonly [number, number, number]; position: readonly [number, number, number] } {
  const local = chapterLocalTime(time, chapter);
  const position = orbitCameraPosition(chapter);
  return {
    time: shouldAdvanceOrbit(local) ? orbitTimeFor(chapter) : null,
    target: [0, 0, chapter.zPosition],
    position: [position.x, position.y, position.z],
  };
}
