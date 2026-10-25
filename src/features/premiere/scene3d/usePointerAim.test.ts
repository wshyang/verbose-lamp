// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupDomTests } from '@/test/dom';
import {
  POINTER_EASE_PER_SECOND,
  normalisePointer,
  stepToward,
  usePointerAim,
} from './usePointerAim';

setupDomTests();

describe('normalisePointer', () => {
  it('maps the middle of the viewport to the origin', () => {
    expect(normalisePointer(500, 400, 1000, 800)).toEqual({ x: 0, y: -0 });
  });

  it('maps the corners to the unit square, with up positive', () => {
    expect(normalisePointer(1000, 0, 1000, 800)).toEqual({ x: 1, y: 1 });
    expect(normalisePointer(0, 800, 1000, 800)).toEqual({ x: -1, y: -1 });
  });

  it('never divides by a zero-sized viewport', () => {
    expect(normalisePointer(0, 0, 0, 0)).toEqual({ x: -1, y: 1 });
  });
});

describe('stepToward', () => {
  it('eases a fraction of the distance set by the frame delta', () => {
    const next = stepToward({ x: 0, y: 0 }, { x: 1, y: -1 }, 0.1);
    expect(next.x).toBeCloseTo(0.1 * POINTER_EASE_PER_SECOND, 9);
    expect(next.y).toBeCloseTo(-0.1 * POINTER_EASE_PER_SECOND, 9);
  });

  it('clamps a long frame to one step, and a negative one to none', () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 4, y: 0 }, 5)).toEqual({ x: 4, y: 0 });
    expect(stepToward({ x: 2, y: 3 }, { x: 9, y: 9 }, -1)).toEqual({ x: 2, y: 3 });
  });
});

describe('usePointerAim', () => {
  it('tracks the pointer while the scene is live', () => {
    const { result } = renderHook(() => usePointerAim(false));

    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: window.innerWidth, clientY: 0 })
    );

    expect(result.current.current.x).toBeCloseTo(1, 9);
    expect(result.current.current.y).toBeCloseTo(1, 9);
  });

  it('ignores the pointer on a frozen frame, so a stray mouse cannot move a screenshot', () => {
    const { result } = renderHook(() => usePointerAim(true));

    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: window.innerWidth, clientY: 0 })
    );

    expect(result.current.current.x).toBe(0);
    expect(result.current.current.y).toBe(0);
  });

  it('stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => usePointerAim(false));
    unmount();

    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: window.innerWidth, clientY: 0 })
    );

    expect(result.current.current.x).toBe(0);
  });
});
