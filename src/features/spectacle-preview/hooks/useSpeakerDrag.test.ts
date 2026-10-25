// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSpeakerDrag } from './useSpeakerDrag';


function pointerEvent(movementX = 0, movementY = 0) {
  const setPointerCapture = vi.fn();
  return {
    pointerId: 3,
    movementX,
    movementY,
    currentTarget: { setPointerCapture },
    setPointerCapture,
  } as unknown as Parameters<ReturnType<typeof useSpeakerDrag>['onPointerMove']>[0];
}

describe('useSpeakerDrag', () => {
  it('reports movement as viewport fractions while dragging', () => {
    const move = vi.fn();
    const { result } = renderHook(() => useSpeakerDrag(move));

    result.current.onPointerDown(pointerEvent());
    result.current.onPointerMove(pointerEvent(64, 32));

    expect(move).toHaveBeenCalledWith(64 / window.innerWidth, 32 / window.innerHeight);
  });

  it('captures the pointer on the element under the pointer', () => {
    const { result } = renderHook(() => useSpeakerDrag(vi.fn()));
    const event = pointerEvent();

    result.current.onPointerDown(event);

    expect(event.currentTarget.setPointerCapture).toHaveBeenCalledWith(3);
  });

  it('ignores movement before the drag starts', () => {
    const move = vi.fn();
    const { result } = renderHook(() => useSpeakerDrag(move));

    result.current.onPointerMove(pointerEvent(10, 10));

    expect(move).not.toHaveBeenCalled();
  });

  it('stops reporting after the pointer is released', () => {
    const move = vi.fn();
    const { result } = renderHook(() => useSpeakerDrag(move));

    result.current.onPointerDown(pointerEvent());
    result.current.onPointerUp();
    result.current.onPointerMove(pointerEvent(10, 10));

    expect(move).not.toHaveBeenCalled();
  });
});
