import { useEffect, useRef, type MutableRefObject } from 'react';
import { normalisePointer, type Aim } from './pointerAim';

/**
 * The guest's pointer, normalised to -1..1 and held in a ref the camera reads each frame
 * (the smoothing itself is `stepToward`). Listens on `window`, exactly as the manager did:
 * the canvas is not the only thing the pointer can be over. A frozen scene ignores the
 * pointer, so a stray mouse move cannot change a screenshot.
 */
export function usePointerAim(frozen: boolean): MutableRefObject<Aim> {
  const target = useRef<Aim>({ x: 0, y: 0 });

  useEffect(() => {
    if (frozen) return;
    const handle = (event: PointerEvent) => {
      target.current = normalisePointer(
        event.clientX,
        event.clientY,
        window.innerWidth,
        window.innerHeight,
      );
    };
    window.addEventListener('pointermove', handle);
    return () => window.removeEventListener('pointermove', handle);
  }, [frozen]);

  return target;
}
