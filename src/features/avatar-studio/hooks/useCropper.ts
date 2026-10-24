import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { RasterDimensions, SquareBox } from '@/shared/lib/raster';
import { clampBox, moveBox, resizeBox } from '../cropBox';

type DragMode = 'move' | 'resize';

interface DragStart {
  readonly mode: DragMode;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly box: SquareBox;
  readonly scale: number;
}

/** Keyboard nudge: 2 % of the short edge per arrow press. */
const NUDGE_SHARE = 0.02;
const ARROWS: Readonly<Record<string, { x: number; y: number }>> = Object.freeze({
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
});

/**
 * Drag state for the manual square. All geometry is the pure `cropBox` math; this hook only
 * turns pointer and keyboard events into deltas in photo pixels.
 */
export function useCropper(photo: RasterDimensions, initial: SquareBox) {
  const [box, setBox] = useState(() => clampBox(initial, photo));
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragStart | null>(null);

  const begin = useCallback((mode: DragMode, event: PointerEvent<HTMLElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    frame.setPointerCapture(event.pointerId);
    const scale = photo.width / Math.max(1, frame.getBoundingClientRect().width);
    drag.current = { mode, pointerX: event.clientX, pointerY: event.clientY, box, scale };
  }, [box, photo.width]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start) return;
    const by = { x: (event.clientX - start.pointerX) * start.scale, y: (event.clientY - start.pointerY) * start.scale };
    setBox(start.mode === 'move' ? moveBox(start.box, by, photo) : resizeBox(start.box, by, photo));
  }, [photo]);

  const onPointerUp = useCallback(() => { drag.current = null; }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const step = Math.min(photo.width, photo.height) * NUDGE_SHARE;
    const arrow = ARROWS[event.key];
    if (arrow) setBox((current) => moveBox(current, { x: arrow.x * step, y: arrow.y * step }, photo));
    else if (event.key === '+' || event.key === '=') setBox((current) => resizeBox(current, { x: step, y: step }, photo));
    else if (event.key === '-') setBox((current) => resizeBox(current, { x: -step, y: -step }, photo));
    else return;
    event.preventDefault();
  }, [photo]);

  const squareStyle = useMemo<CSSProperties>(() => ({
    left: `${(box.x / photo.width) * 100}%`,
    top: `${(box.y / photo.height) * 100}%`,
    width: `${(box.size / photo.width) * 100}%`,
    height: `${(box.size / photo.height) * 100}%`,
  }), [box, photo.width, photo.height]);

  return {
    box, frameRef, squareStyle, onKeyDown, onPointerMove, onPointerUp,
    onMoveStart: (event: PointerEvent<HTMLElement>) => begin('move', event),
    onResizeStart: (event: PointerEvent<HTMLElement>) => begin('resize', event),
  };
}
