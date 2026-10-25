import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The guest's pointer, normalised to −1…1 and smoothed (ADDENDUM-022 §6 step 2.3).
 *
 * `GatsbySceneManager` kept a target vector and a smoothed vector and lerped one
 * toward the other each frame. Both halves live here: the listener fills `target`,
 * and `stepToward` is the per-frame ease the camera calls, so a test can check the
 * ease without a DOM or a clock.
 */

/** Pointer travel is deliberately lazy: 4.5 × delta, capped at one step per frame. */
export const POINTER_EASE_PER_SECOND = 4.5;

/** Screen pixels → −1…1, with Y flipped so up is positive. */
export function normalisePointer(clientX: number, clientY: number, width: number, height: number) {
  const x = (clientX / Math.max(1, width)) * 2 - 1;
  const y = -((clientY / Math.max(1, height)) * 2 - 1);
  return { x, y };
}

/** One frame of smoothing; `deltaSeconds` is a real frame delta. */
export function stepToward(
  smooth: { x: number; y: number },
  target: { x: number; y: number },
  deltaSeconds: number
): { x: number; y: number } {
  const amount = Math.min(1, Math.max(0, deltaSeconds) * POINTER_EASE_PER_SECOND);
  return {
    x: smooth.x + (target.x - smooth.x) * amount,
    y: smooth.y + (target.y - smooth.y) * amount,
  };
}

/**
 * Listens on `window`, exactly as the manager did — the canvas is not the only thing
 * the pointer can be over. Frozen scenes ignore the pointer, so a screenshot cannot be
 * changed by a stray mouse move.
 */
export function usePointerAim(frozen: boolean) {
  const target = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    if (frozen) return;
    const handle = (event: PointerEvent) => {
      const next = normalisePointer(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
      target.current.set(next.x, next.y);
    };
    window.addEventListener('pointermove', handle);
    return () => window.removeEventListener('pointermove', handle);
  }, [frozen]);

  return target;
}
