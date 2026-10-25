// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { type ComposedAvatar } from '../types';

import { useShimmerFrames } from './useShimmerFrames';

const shimmer = vi.hoisted(() => ({ shimmerFrames: vi.fn(() => [{ width: 1, height: 1, data: new Uint8ClampedArray(4) }]) }));
vi.mock('../shimmer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shimmer')>();
  return { ...actual, shimmerFrames: shimmer.shimmerFrames };
});
const avatar: ComposedAvatar = {
  image: { width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) },
  metal: { width: 1, height: 1, data: new Uint8ClampedArray([0]) },
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('useShimmerFrames', () => {
  it('shows the still first and adds the glint loop once settled', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useShimmerFrames(avatar, true));
    expect(result.current).toEqual([avatar.image]);
    expect(shimmer.shimmerFrames).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(shimmer.shimmerFrames).toHaveBeenCalledWith(avatar);
    expect(result.current).toHaveLength(2);
  });

  it('keeps only the still while the sheen is off', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useShimmerFrames(avatar, false));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toEqual([avatar.image]);
    expect(shimmer.shimmerFrames).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the settle timer when the avatar changes or the hook unmounts', () => {
    vi.useFakeTimers();
    const next: ComposedAvatar = {
      image: { width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) },
      metal: { width: 1, height: 1, data: new Uint8ClampedArray([255]) },
    };
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useShimmerFrames(value, true),
      { initialProps: { value: avatar } },
    );
    rerender({ value: next });
    expect(result.current).toEqual([next.image]);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
