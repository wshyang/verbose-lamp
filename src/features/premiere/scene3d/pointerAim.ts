/**
 * The guest's pointer as the cinema camera sees it: normalised to -1..1 and eased
 * (ADDENDUM-022 §2.3). Pure, so the ease can be checked without a DOM or a clock; the
 * window listener that feeds it lives in `usePointerAim`.
 */

/** Pointer travel is deliberately lazy: 4.5 x delta, capped at one step per frame. */
export const POINTER_EASE_PER_SECOND = 4.5;

/** The shipped manager capped the frame delta at 50 ms before easing, so a stall cannot snap the aim. */
export const MAX_AIM_STEP_SECONDS = 0.05;

export interface Aim {
  readonly x: number;
  readonly y: number;
}

/** Screen pixels to -1..1, with Y flipped so up is positive. */
export function normalisePointer(clientX: number, clientY: number, width: number, height: number): Aim {
  return {
    x: (clientX / Math.max(1, width)) * 2 - 1,
    y: -((clientY / Math.max(1, height)) * 2 - 1),
  };
}

/** One frame of easing from `smooth` toward `target`; `deltaSeconds` is a real frame delta. */
export function stepToward(smooth: Aim, target: Aim, deltaSeconds: number): Aim {
  const seconds = Number.isNaN(deltaSeconds) ? 0 : Math.min(MAX_AIM_STEP_SECONDS, Math.max(0, deltaSeconds));
  const amount = Math.min(1, seconds * POINTER_EASE_PER_SECOND);
  return {
    x: smooth.x + (target.x - smooth.x) * amount,
    y: smooth.y + (target.y - smooth.y) * amount,
  };
}
