// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShimmerFrames } from './useShimmerFrames';

const image = (id: number) => ({ width: id, height: id, data: new Uint8ClampedArray(id) });
const first = { image: image(1) } as never;
const second = { image: image(2) } as never;
const loop = [image(3), image(4)];

const mocks = vi.hoisted(() => ({ shimmerFrames: vi.fn() }));
vi.mock('../shimmer', () => ({ shimmerFrames: mocks.shimmerFrames }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.shimmerFrames.mockReturnValue(loop);
});

afterEach(() => vi.useRealTimers());

describe('useShimmerFrames', () => {
  it('shows the still first, then the settled glint loop', () => {
    const { result } = renderHook(() => useShimmerFrames(first, true));
    expect(result.current).toEqual([image(1)]);
    act(() => vi.advanceTimersByTime(219));
    expect(result.current).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual([image(1), ...loop]);
    expect(mocks.shimmerFrames).toHaveBeenCalledWith(first);
  });

  it('never computes a loop when shimmer is off', () => {
    const { result, rerender } = renderHook(
      ({ avatar, on }: { avatar: never; on: boolean }) => useShimmerFrames(avatar, on),
      { initialProps: { avatar: first, on: false } }
    );
    act(() => vi.advanceTimersByTime(220));
    expect(result.current).toEqual([image(1)]);
    rerender({ avatar: second, on: false });
    expect(result.current).toEqual([image(2)]);
    expect(mocks.shimmerFrames).not.toHaveBeenCalled();
  });

  it('cancels a pending loop when the avatar changes or the hook unmounts', () => {
    const { rerender, unmount } = renderHook(
      ({ avatar }: { avatar: never }) => useShimmerFrames(avatar, true),
      { initialProps: { avatar: first } }
    );
    rerender({ avatar: second });
    act(() => vi.advanceTimersByTime(220));
    expect(mocks.shimmerFrames).toHaveBeenCalledOnce();
    expect(mocks.shimmerFrames).toHaveBeenCalledWith(second);
    rerender({ avatar: first });
    unmount();
    act(() => vi.advanceTimersByTime(220));
    expect(mocks.shimmerFrames).toHaveBeenCalledOnce();
  });
});
