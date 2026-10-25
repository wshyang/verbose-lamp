// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { AMBIENT_START_DELAY_MS, useAmbientShow } from './useAmbientShow';

setupDomTests();

afterEach(() => {
  vi.useRealTimers();
});

describe('useAmbientShow', () => {
  it('waits for the stage before starting', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { rerender } = renderHook(({ isReady }) => useAmbientShow({ isReady, start }), {
      initialProps: { isReady: false },
    });

    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS);
    expect(start).not.toHaveBeenCalled();

    rerender({ isReady: true });
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS - 1);
    expect(start).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('never starts twice, even if readiness flaps', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { rerender } = renderHook(({ isReady }) => useAmbientShow({ isReady, start }), {
      initialProps: { isReady: true },
    });

    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS);
    rerender({ isReady: false });
    rerender({ isReady: true });
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS * 2);

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('calls the newest start callback', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ start, isReady }: { start: () => void; isReady: boolean }) => useAmbientShow({ isReady, start }),
      { initialProps: { start: first, isReady: false } },
    );

    rerender({ start: second, isReady: false });
    rerender({ start: second, isReady: true });
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending start on unmount', () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const { unmount } = renderHook(() => useAmbientShow({ isReady: true, start }));

    unmount();
    vi.advanceTimersByTime(AMBIENT_START_DELAY_MS);

    expect(start).not.toHaveBeenCalled();
  });
});
