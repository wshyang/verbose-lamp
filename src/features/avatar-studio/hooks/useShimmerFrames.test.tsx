// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';

setupDomTests();

const shimmer = vi.hoisted(() => ({ shimmerFrames: vi.fn() }));
vi.mock('../shimmer', () => shimmer);

import { useShimmerFrames } from './useShimmerFrames';
import type { ComposedAvatar } from '../types';

const avatar = (seed: number) =>
  ({ image: { width: 2, height: 2, data: new Uint8ClampedArray([seed, seed, seed, 255]) } }) as ComposedAvatar;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  shimmer.shimmerFrames.mockImplementation(() => [
    { width: 2, height: 2, data: new Uint8ClampedArray([9, 9, 9, 255]) },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useShimmerFrames', () => {
  it('shows the still first and adds the glint loop once the look settles', () => {
    const still = avatar(1);
    const { result } = renderHook(() => useShimmerFrames(still, true));

    expect(result.current).toEqual([still.image]);
    expect(shimmer.shimmerFrames).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(shimmer.shimmerFrames).toHaveBeenCalledWith(still);
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe(still.image);
  });

  it('does not animate before the settle delay', () => {
    // The avatar identity is a dependency: build it once, outside the render.
    const still = avatar(2);
    renderHook(() => useShimmerFrames(still, true));

    act(() => {
      vi.advanceTimersByTime(219);
    });

    expect(shimmer.shimmerFrames).not.toHaveBeenCalled();
  });

  it('keeps a single still when the sheen is off', () => {
    const still = avatar(3);
    const { result } = renderHook(() => useShimmerFrames(still, false));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(shimmer.shimmerFrames).not.toHaveBeenCalled();
    expect(result.current).toEqual([still.image]);
  });

  it('restarts the settle timer when the avatar changes', () => {
    const first = avatar(4);
    const { result, rerender } = renderHook(
      ({ value }) => useShimmerFrames(value, true),
      { initialProps: { value: first } }
    );

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(result.current).toHaveLength(2);

    const second = avatar(5);
    rerender({ value: second });
    // Back to the still while the new look settles.
    expect(result.current).toEqual([second.image]);

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(shimmer.shimmerFrames).toHaveBeenLastCalledWith(second);
    expect(result.current).toHaveLength(2);
  });

  it('cancels a pending frame build when it unmounts', () => {
    const still = avatar(6);
    const { unmount } = renderHook(() => useShimmerFrames(still, true));

    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(shimmer.shimmerFrames).not.toHaveBeenCalled();
  });
});
