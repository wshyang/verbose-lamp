import { useCallback, useRef, type PointerEvent } from 'react';

/** Pointer-captured drag that reports movement as fractions of the viewport. */
export function useSpeakerDrag(move: (dx: number, dy: number) => void) {
  const isDragging = useRef(false);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!isDragging.current) return;
      move(e.movementX / window.innerWidth, e.movementY / window.innerHeight);
    },
    [move],
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
