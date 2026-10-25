// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { type ComposedAvatar } from '../types';

import { useShimmerFrames } from './useShimmerFrames';

import { setupDomTests } from '@/test/dom';

setupDomTests();
const shimmer_p6 = vi.hoisted(() => ({ shimmerFrames: vi.fn() }));
vi.mock('../shimmer', () => shimmer_p6);
const avatar_p6 = (seed: number) =>
  ({ image: { width: 2, height: 2, data: new Uint8ClampedArray([seed, seed, seed, 255]) } }) as ComposedAvatar;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  shimmer_p6.shimmerFrames.mockImplementation(() => [
    { width: 2, height: 2, data: new Uint8ClampedArray([9, 9, 9, 255]) },
  ]);
});
afterEach(() => {
  vi.useRealTimers();
});
describe('useShimmerFrames', () => {
  it('shows the still first and adds the glint loop once the look settles', () => {
    const still = avatar_p6(1);
    const { result } = renderHook(() => useShimmerFrames(still, true));

    expect(result.current).toEqual([still.image]);
    expect(shimmer_p6.shimmerFrames).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(shimmer_p6.shimmerFrames).toHaveBeenCalledWith(still);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(still.image);
  });

  it('does not animate before the settle delay', () => {
    // The avatar identity is a dependency: build it once, outside the render.
    const still = avatar_p6(2);
    renderHook(() => useShimmerFrames(still, true));

    act(() => {
      vi.advanceTimersByTime(219);
    });

    expect(shimmer_p6.shimmerFrames).not.toHaveBeenCalled();
  });

  it('keeps a single still when the sheen is off', () => {
    const still = avatar_p6(3);
    const { result } = renderHook(() => useShimmerFrames(still, false));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(shimmer_p6.shimmerFrames).not.toHaveBeenCalled();
    expect(result.current).toEqual([still.image]);
  });

  it('restarts the settle timer when the avatar changes', () => {
    const first = avatar_p6(4);
    const { result, rerender } = renderHook(
      ({ value }) => useShimmerFrames(value, true),
      { initialProps: { value: first } }
    );

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(result.current).toHaveLength(2);

    const second = avatar_p6(5);
    rerender({ value: second });
    // Back to the still while the new look settles.
    expect(result.current).toEqual([second.image]);

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(shimmer_p6.shimmerFrames).toHaveBeenLastCalledWith(second);
    expect(result.current).toHaveLength(2);
  });
});
