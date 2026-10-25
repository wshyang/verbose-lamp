// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePointerAim } from './usePointerAim';

function movePointer(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY }));
  });
}

function sizeWindow(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

describe('usePointerAim', () => {
  it('starts at the centre', () => {
    const { result } = renderHook(() => usePointerAim(false));

    expect(result.current.current).toEqual({ x: 0, y: 0 });
  });

  it('tracks the pointer across the whole window, not just the canvas', () => {
    const { result } = renderHook(() => usePointerAim(false));
    sizeWindow(1000, 500);

    movePointer(750, 125);

    expect(result.current.current).toEqual({ x: 0.5, y: 0.5 });
  });

  it('keeps tracking after the pointer moves again', () => {
    const { result } = renderHook(() => usePointerAim(false));
    sizeWindow(1000, 500);

    movePointer(0, 0);
    movePointer(1000, 500);

    expect(result.current.current).toEqual({ x: 1, y: -1 });
  });

  // A frozen scene is a screenshot: a stray mouse move must not change the picture.
  it('ignores the pointer entirely while the scene is frozen', () => {
    const { result } = renderHook(() => usePointerAim(true));
    sizeWindow(1000, 500);

    movePointer(900, 100);

    expect(result.current.current).toEqual({ x: 0, y: 0 });
  });

  it('starts listening when a frozen scene thaws, and stops when it freezes', () => {
    const { result, rerender } = renderHook(({ frozen }) => usePointerAim(frozen), {
      initialProps: { frozen: true },
    });
    sizeWindow(1000, 500);

    movePointer(1000, 0);
    expect(result.current.current).toEqual({ x: 0, y: 0 });

    rerender({ frozen: false });
    movePointer(1000, 0);
    expect(result.current.current).toEqual({ x: 1, y: 1 });

    rerender({ frozen: true });
    movePointer(0, 500);
    expect(result.current.current).toEqual({ x: 1, y: 1 });
  });

  it('stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => usePointerAim(false));
    sizeWindow(1000, 500);

    unmount();
    movePointer(1000, 0);

    expect(result.current.current).toEqual({ x: 0, y: 0 });
  });
});
