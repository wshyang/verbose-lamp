// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { useCropper } from './useCropper';

import { setupDomTests } from '@/test/dom';

import { type SquareBox } from '@/shared/lib/raster';

setupDomTests();
const photo_p6 = { width: 500, height: 400 };
const start: SquareBox = { x: 50, y: 40, size: 320 };
/** A React-ish pointer event: the hook only reads these five members. */
interface FakePointer {
  clientX: number;
  clientY: number;
  pointerId: number;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
}
const pointer = (clientX: number, clientY: number, pointerId = 1): FakePointer => ({
  clientX,
  clientY,
  pointerId,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});
const key = (value: string) => ({ key: value, preventDefault: vi.fn() });
/** React's synthetic event shape, narrowed to the members the hook reads. */
const asPointer = (event: FakePointer) => event as unknown as React.PointerEvent<HTMLElement>;
const asKey = (event: { key: string; preventDefault: () => void }) =>
  event as unknown as React.KeyboardEvent<HTMLElement>;
function mountFrame(width = 250) {
  const view = renderHook(() => useCropper(photo_p6, start));
  const element = document.createElement('div');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height: width, top: 0, left: 0, right: width, bottom: width }),
  });
  element.setPointerCapture = vi.fn();
  view.result.current.frameRef.current = element;
  return { ...view, element };
}
describe('useCropper', () => {
  it('opens with the clamped starting box', () => {
    const { result } = renderHook(() => useCropper(photo_p6, { x: -40, y: 900, size: 5000 }));

    expect(result.current.box).toEqual({ x: 0, y: 0, size: 400 });
  });

  it('positions the square as percentages of the photo', () => {
    const { result } = mountFrame();

    expect(result.current.squareStyle).toEqual({
      left: '10%',
      top: '10%',
      width: '64%',
      height: '80%',
    });
  });

  it('drags the square in photo pixels scaled from the on-screen frame', () => {
    const { result, element } = mountFrame();

    const down = pointer(10, 10);
    act(() => result.current.onMoveStart(down as never));
    expect(down.preventDefault).toHaveBeenCalled();
    expect(down.stopPropagation).toHaveBeenCalled();
    expect(element.setPointerCapture).toHaveBeenCalledWith(1);

    // 20 on-screen px at scale 2 = 40 photo px.
    act(() => result.current.onPointerMove(asPointer(pointer(30, 30))));
    expect(result.current.box).toEqual({ x: 90, y: 80, size: 320 });

    act(() => result.current.onPointerUp());
    act(() => result.current.onPointerMove(asPointer(pointer(200, 200))));
    // Released: further movement is ignored.
    expect(result.current.box).toEqual({ x: 90, y: 80, size: 320 });
  });

  it('clamps a drag at the photo edge', () => {
    const { result } = mountFrame();

    act(() => result.current.onMoveStart(asPointer(pointer(0, 0))));
    act(() => result.current.onPointerMove(asPointer(pointer(9999, 9999))));

    expect(result.current.box).toEqual({ x: 180, y: 80, size: 320 });
  });

  it('resizes from the handle instead of moving', () => {
    const { result } = mountFrame();

    act(() => result.current.onResizeStart(asPointer(pointer(0, 0))));
    act(() => result.current.onPointerMove(asPointer(pointer(-40, -40))));

    // 40 on-screen px inward at scale 2 = 80 photo px smaller; the top-left stays put.
    expect(result.current.box.size).toBe(240);
    expect(result.current.box.x).toBe(50);
  });

  it('does nothing before a frame is attached', () => {
    const { result } = renderHook(() => useCropper(photo_p6, start));

    act(() => result.current.onMoveStart(asPointer(pointer(0, 0))));
    act(() => result.current.onPointerMove(asPointer(pointer(100, 100))));

    expect(result.current.box).toEqual(start);
  });

  it('nudges with the arrow keys by 2% of the short edge', () => {
    const { result } = mountFrame();

    const right = key('ArrowRight');
    act(() => result.current.onKeyDown(asKey(right)));
    expect(right.preventDefault).toHaveBeenCalled();
    // short edge 400 * 0.02 = 8 px
    expect(result.current.box.x).toBe(58);

    act(() => result.current.onKeyDown(asKey(key('ArrowUp'))));
    expect(result.current.box.y).toBe(32);

    act(() => result.current.onKeyDown(asKey(key('ArrowDown'))));
    act(() => result.current.onKeyDown(asKey(key('ArrowLeft'))));
    expect(result.current.box).toMatchObject({ x: 50, y: 40 });
  });

  it('grows and shrinks the square with plus and minus', () => {
    const { result } = mountFrame();

    act(() => result.current.onKeyDown(asKey(key('+'))));
    expect(result.current.box.size).toBe(328);

    act(() => result.current.onKeyDown(asKey(key('='))));
    expect(result.current.box.size).toBe(336);

    act(() => result.current.onKeyDown(asKey(key('-'))));
    expect(result.current.box.size).toBe(328);
  });

  it('ignores other keys entirely', () => {
    const { result } = mountFrame();

    const other = key('Tab');
    act(() => result.current.onKeyDown(asKey(other)));

    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(result.current.box).toEqual(start);
  });
});
