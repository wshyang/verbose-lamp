import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';

/**
 * The premiere's clock, without a renderer. `PlaybackClock` drives it from
 * `useFrame`; the tests drive it directly (ADDENDUM-022 §7).
 */

/** A tab that was hidden for a second must not skip a whole act on return. */
export const MAX_FRAME_DT = 0.05;

export interface ClockState {
  readonly time: number;
  readonly isPlaying: boolean;
}

/** One frame of sequence time. Frozen time never moves, whatever `isPlaying` says. */
export function advanceClock(state: ClockState, deltaSeconds: number, frozen: boolean): number {
  if (frozen || !state.isPlaying) return state.time;
  const dt = Number.isFinite(deltaSeconds) ? Math.min(MAX_FRAME_DT, Math.max(0, deltaSeconds)) : 0;
  const next = state.time + dt;
  // The film wraps to the top rather than holding on its last frame.
  return next >= TOTAL_SEQUENCE_DURATION ? next - TOTAL_SEQUENCE_DURATION : next;
}

/**
 * Wall-clock elapsed time for the ambient shaders. A frozen frame reports *its own*
 * time — the manager read `elapsed = freezeAt ?? clock.elapsedTime`, and the ambient
 * shaders, the camera drift and the searchlight sway are all functions of it, so a
 * frozen frame that starts its shader clock at zero is a different picture.
 */
export function advanceElapsed(
  elapsed: number,
  deltaSeconds: number,
  freezeAt: number | null
): number {
  if (freezeAt !== null) return freezeAt;
  const dt = Number.isFinite(deltaSeconds) ? Math.min(MAX_FRAME_DT, Math.max(0, deltaSeconds)) : 0;
  return elapsed + dt;
}

/** Frames a frozen scene waits for before it reports itself ready for a screenshot. */
export const FRAME_READY_FRAMES = 3;
