// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCropper } from './useCropper';

const photo = { width: 400, height: 300 };
const initial = { x: 40, y: 20, size: 160 };

function attachFrame(result: { current: { frameRef: { current: HTMLDivElement | null } } }, width = 400) {
  const frame = document.createElement('div');
  frame.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: width, width, height: width, toJSON: () => ({}) }) as DOMRect;
  frame.setPointerCapture = vi.fn();
  result.current.frameRef.current = frame;
  return frame;
}

function pointerEvent(overrides: Record<string, unknown> = {}) {
  return {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as never;
}

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as never;
}

describe('useCropper', () => {
  it('opens on the clamped starting box and reports it as percentages', () => {
    const { result } = renderHook(() => useCropper(photo, initial));
    expect(result.current.box).toEqual({ x: 40, y: 20, size: 160 });
    expect(result.current.squareStyle).toEqual({
      left: '10%',
      top: `${(20 / 300) * 100}%`,
      width: '40%',
      height: `${(160 / 300) * 100}%`,
    });
  });

  it('clamps a starting box that is out of bounds', () => {
    const { result } = renderHook(() => useCropper(photo, { x: -50, y: 900, size: 5000 }));
    expect(result.current.box).toEqual({ x: 0, y: 0, size: 300 });
  });

  it('drags the square when a drag has begun', () => {
    const { result } = renderHook(() => useCropper(photo, initial));
    const frame = attachFrame(result);

    act(() => result.current.onMoveStart(pointerEvent({ clientX: 100, clientY: 100 })));
    expect(frame.setPointerCapture).toHaveBeenCalledWith(1);

    act(() => result.current.onPointerMove(pointerEvent({ clientX: 140, clientY: 130 })));
    expect(result.current.box).toEqual({ x: 80, y: 50, size: 160 });

    act(() => result.current.onPointerUp());
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 400, clientY: 400 })));
    expect(result.current.box).toEqual({ x: 80, y: 50, size: 160 });
  });

  it('resizes from the handle and scales with the on-screen frame', () => {
    const { result } = renderHook(() => useCropper(photo, initial));
    attachFrame(result, 200);

    act(() => result.current.onResizeStart(pointerEvent({ clientX: 0, clientY: 0 })));
    act(() => result.current.onPointerMove(pointerEvent({ clientX: 10, clientY: 10 })));
    expect(result.current.box.size).toBe(180);
  });

  it('ignores a pointer start before the frame exists', () => {
    const { result } = renderHook(() => useCropper(photo, initial));
    const event = pointerEvent();
    act(() => result.current.onMoveStart(event));
    expect(result.current.box).toEqual(initial);
    expect((event as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).not.toHaveBeenCalled();
  });

  it('nudges with the arrow keys and grows or shrinks with + and -', () => {
    const { result } = renderHook(() => useCropper(photo, initial));

    act(() => result.current.onKeyDown(keyEvent('ArrowLeft')));
    expect(result.current.box.x).toBe(34);
    act(() => result.current.onKeyDown(keyEvent('ArrowRight')));
    expect(result.current.box.x).toBe(40);
    act(() => result.current.onKeyDown(keyEvent('ArrowUp')));
    expect(result.current.box.y).toBe(14);
    act(() => result.current.onKeyDown(keyEvent('ArrowDown')));
    expect(result.current.box.y).toBe(20);

    act(() => result.current.onKeyDown(keyEvent('+')));
    expect(result.current.box.size).toBe(166);
    act(() => result.current.onKeyDown(keyEvent('=')));
    expect(result.current.box.size).toBe(172);
    act(() => result.current.onKeyDown(keyEvent('-')));
    expect(result.current.box.size).toBe(166);
  });

  it('leaves other keys alone', () => {
    const { result } = renderHook(() => useCropper(photo, initial));
    const event = keyEvent('a');
    act(() => result.current.onKeyDown(event));
    expect(result.current.box).toEqual(initial);
    expect((event as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).not.toHaveBeenCalled();
  });
});
