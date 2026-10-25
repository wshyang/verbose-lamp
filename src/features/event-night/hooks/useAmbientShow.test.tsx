// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AMBIENT_START_DELAY_MS, useAmbientShow } from './useAmbientShow';

afterEach(() => {
  vi.useRealTimers();
});

describe('useAmbientShow', () => {
  it('waits for a ready stage before scheduling the show', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { rerender } = renderHook(({ isReady }) => useAmbientShow({ isReady, start }), {
      initialProps: { isReady: false },
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(start).not.toHaveBeenCalled();

    rerender({ isReady: true });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts only once, even if readiness flips again', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { rerender } = renderHook(({ isReady }) => useAmbientShow({ isReady, start }), {
      initialProps: { isReady: true },
    });
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ isReady: false });
    rerender({ isReady: true });
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS * 2);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending timer on unmount', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { unmount } = renderHook(() => useAmbientShow({ isReady: true, start }));
    unmount();
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS * 2);
    expect(start).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('calls the latest start callback', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ start }) => useAmbientShow({ isReady: true, start }), {
      initialProps: { start: first },
    });
    rerender({ start: second });
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
