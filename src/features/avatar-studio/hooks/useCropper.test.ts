// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCropper } from './useCropper';

const PHOTO = { width: 100, height: 80 };

function pointer(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    pointerId: 9,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent<HTMLElement>;
}

function key(name: string) {
  return { key: name, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>;
}

function attachFrame(result: { current: ReturnType<typeof useCropper> }, width = 50) {
  const frame = {
    setPointerCapture: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ width })),
  };
  result.current.frameRef.current = frame as unknown as HTMLDivElement;
  return frame;
}

describe('useCropper', () => {
  it('clamps the initial box and derives percentage styles', () => {
    const { result } = renderHook(() => useCropper(PHOTO, { x: 90, y: -5, size: 200 }));
    expect(result.current.box).toEqual({ x: 20, y: 0, size: 80 });
    expect(result.current.squareStyle).toEqual({
      left: '20%', top: '0%', width: '80%', height: '100%',
    });
  });

  it('ignores drags with no frame and moves with photo-pixel scaling', () => {
    const { result } = renderHook(() => useCropper(PHOTO, { x: 10, y: 10, size: 40 }));
    act(() => result.current.onPointerMove(pointer(99, 99)));
    act(() => result.current.onMoveStart(pointer(0, 0)));
    expect(result.current.box).toEqual({ x: 10, y: 10, size: 40 });

    const frame = attachFrame(result);
    const start = pointer(5, 6);
    act(() => result.current.onMoveStart(start));
    expect(start.preventDefault).toHaveBeenCalledOnce();
    expect(start.stopPropagation).toHaveBeenCalledOnce();
    expect(frame.setPointerCapture).toHaveBeenCalledWith(9);
    act(() => result.current.onPointerMove(pointer(10, 10)));
    expect(result.current.box).toEqual({ x: 20, y: 18, size: 40 });
    act(() => result.current.onPointerUp());
    act(() => result.current.onPointerMove(pointer(50, 50)));
    expect(result.current.box).toEqual({ x: 20, y: 18, size: 40 });
  });

  it('resizes from the handle and guards zero-width frames', () => {
    const { result } = renderHook(() => useCropper(PHOTO, { x: 10, y: 10, size: 40 }));
    attachFrame(result, 0);
    act(() => result.current.onResizeStart(pointer(0, 0)));
    act(() => result.current.onPointerMove(pointer(0.01, 0)));
    expect(result.current.box.size).toBeGreaterThan(40);
  });

  it('handles every keyboard nudge and resize, ignoring other keys', () => {
    const { result } = renderHook(() => useCropper(PHOTO, { x: 30, y: 20, size: 40 }));
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'];
    for (const name of keys) {
      const event = key(name);
      act(() => result.current.onKeyDown(event));
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    expect(result.current.box).toEqual({ x: 30, y: 20, size: 41.6 });
    const ignored = key('x');
    act(() => result.current.onKeyDown(ignored));
    expect(ignored.preventDefault).not.toHaveBeenCalled();
  });
});
