import { useCallback, useRef, type PointerEvent } from 'react';

/** Pointer-captured drag that reports movement as fractions of the viewport. */
export function useSpeakerDrag(move: (dx: number, dy: number) => void) {
  const isDragging = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    isDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!isDragging.current) return;
      move(event.movementX / window.innerWidth, event.movementY / window.innerHeight);
    },
    [move]
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
