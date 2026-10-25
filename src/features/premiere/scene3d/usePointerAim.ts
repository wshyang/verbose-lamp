import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PremiereStore } from './premiereStore';

export interface PointerAimRef {
  x: number;
  y: number;
}

/** Window pointer aim in NDC; frozen likeness frames deliberately ignore it. */
export function usePointerAim(store: PremiereStore): MutableRefObject<PointerAimRef> {
  const targetRef = useRef<PointerAimRef>({ x: 0, y: 0 });

  useEffect(() => {
    if (store.getState().freezeAt !== null) return undefined;
    const onPointerMove = (event: PointerEvent) => {
      targetRef.current = {
        x: (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
        y: -((event.clientY / Math.max(1, window.innerHeight)) * 2 - 1),
      };
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [store]);

  return targetRef;
}
