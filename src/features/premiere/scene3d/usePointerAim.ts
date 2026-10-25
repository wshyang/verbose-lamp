import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface PointerAim {
  /** Where the pointer is pointing, −1..1 on both axes. */
  target: THREE.Vector2;
  /** The damped value the camera actually uses. */
  smooth: THREE.Vector2;
  /** Advance the damping by one frame. */
  aim: (delta: number) => THREE.Vector2;
}

/**
 * The pointer parallax the cinema camera has always had (ADDENDUM-022 §6.3), as a hook.
 * A frozen frame ignores the pointer so a screenshot cannot be tilted by a stray cursor.
 */
export function usePointerAim(frozen: boolean): PointerAim {
  const target = useRef(new THREE.Vector2(0, 0));
  const smooth = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    if (frozen) return;
    const onPointerMove = (event: PointerEvent) => {
      const nx = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = -((event.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
      target.current.set(nx, ny);
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [frozen]);

  const aim = useCallback((delta: number) => {
    smooth.current.lerp(target.current, Math.min(1, delta * 4.5));
    return smooth.current;
  }, []);

  return { target: target.current, smooth: smooth.current, aim };
}
