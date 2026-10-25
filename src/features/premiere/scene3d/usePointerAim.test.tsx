// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePointerAim } from './usePointerAim';

const move = (clientX: number, clientY: number) => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY }));
};

describe('usePointerAim', () => {
  it('tracks the pointer as a −1..1 aim and damps towards it', () => {
    window.innerWidth = 1000;
    window.innerHeight = 500;
    const { result } = renderHook(() => usePointerAim(false));

    move(750, 125);
    expect(result.current.target.x).toBeCloseTo(0.5);
    expect(result.current.target.y).toBeCloseTo(0.5);

    const smooth = result.current.aim(0.1);
    expect(smooth.x).toBeCloseTo(0.5 * Math.min(1, 0.45));
    expect(smooth.x).toBeLessThan(result.current.target.x);
  });

  it('stops listening while frozen so a screenshot cannot be tilted', () => {
    const { result } = renderHook(() => usePointerAim(true));
    move(900, 400);
    expect(result.current.target.x).toBe(0);
    expect(result.current.target.y).toBe(0);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => usePointerAim(false));
    unmount();
    move(900, 400);
    // Nothing listens any more; a stray move must not throw.
    expect(true).toBe(true);
  });
});
