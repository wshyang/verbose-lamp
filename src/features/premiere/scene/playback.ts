import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * The premiere's clock, without a renderer. The R3F `PlaybackClock` drives it from
 * `useFrame`; the tests drive it directly (ADDENDUM-022 §2.3). Derived from the shipped
 * manager's frame step, with the hazards that step had made explicit.
 */

/** A tab that was hidden for a second must not skip a whole act on return. */
export const MAX_FRAME_DT = 0.05;

export interface ClockState {
  readonly time: number;
  readonly isPlaying: boolean;
  /** A frozen frame (`?freezeAt=`) never moves, whatever the transport says. */
  readonly isFrozen: boolean;
}

/** One frame of sequence time. The film wraps to its very first frame at the end. */
export function advanceClock(state: ClockState, deltaSeconds: number): number {
  if (state.isFrozen || !state.isPlaying) return state.time;
  // A NaN or negative delta is a frame that did not happen; an infinite one is capped.
  const step = Number.isNaN(deltaSeconds) ? 0 : Math.min(MAX_FRAME_DT, Math.max(0, deltaSeconds));
  const next = state.time + step;
  return next >= TOTAL_SEQUENCE_DURATION ? 0 : next;
}

/**
 * Wall-clock elapsed time for the ambient shaders. Unlike the film clock it is not capped:
 * the shipped manager read `clock.elapsedTime`, and a stalled frame must not slow the
 * shimmer. A frozen frame reports *its own* time, because the ambient shaders, the camera
 * drift and the searchlight sway are all functions of it, so a frozen frame that starts
 * its shader clock at zero is a different picture.
 */
export function advanceElapsed(
  elapsed: number,
  deltaSeconds: number,
  freezeAt: number | null,
): number {
  if (freezeAt !== null) return freezeAt;
  return Number.isFinite(deltaSeconds) ? elapsed + Math.max(0, deltaSeconds) : elapsed;
}

/** Frames a scene draws before it reports itself ready for a screenshot. */
export const FRAME_READY_FRAMES = 3;

/** True only on the frame that crosses the line, so the ready signal fires once. */
export function isFrameReady(framesDrawn: number): boolean {
  return framesDrawn === FRAME_READY_FRAMES;
}
