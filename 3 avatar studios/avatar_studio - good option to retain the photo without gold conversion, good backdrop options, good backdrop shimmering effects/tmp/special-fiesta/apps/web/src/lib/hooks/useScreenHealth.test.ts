import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STALE_AFTER_MS, useScreenHealth } from './useScreenHealth.js';

/**
 * ADR-144 — the wall's one admission of failure, and the two ways it could be wrong: crying
 * wolf at the first dropped request, or going on lying after the reads have come back.
 */
describe('the hall screen\u2019s staleness mark', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says nothing the moment a read fails', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScreenHealth({ isFailing: true }));

    // Beach Wi-Fi drops requests all day. A wall that announced each one would have taught
    // the room to ignore it by ten past nine.
    expect(result.current).toBe(false);
  });

  it('admits it once the failures have lasted the full grace period', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScreenHealth({ isFailing: true }));

    act(() => {
      vi.advanceTimersByTime(STALE_AFTER_MS);
    });

    expect(result.current).toBe(true);
  });

  it('never marks a failure that recovered before the deadline', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook((failing: boolean) => useScreenHealth({ isFailing: failing }), {
      initialProps: true,
    });

    act(() => {
      vi.advanceTimersByTime(STALE_AFTER_MS - 1_000);
    });
    rerender(false);
    act(() => {
      vi.advanceTimersByTime(STALE_AFTER_MS);
    });

    // The pending countdown has to be cancelled, not merely overtaken: a recovered screen
    // that marks itself stale a second later is the cry-wolf failure with extra steps.
    expect(result.current).toBe(false);
  });

  it('takes the mark down the moment a read succeeds', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook((failing: boolean) => useScreenHealth({ isFailing: failing }), {
      initialProps: true,
    });

    act(() => {
      vi.advanceTimersByTime(STALE_AFTER_MS);
    });
    expect(result.current).toBe(true);

    rerender(false);
    // Recovery is news immediately, where trouble waits ninety seconds. The asymmetry is the
    // point: a wall still apologising for a blip that passed is a wall nobody believes.
    expect(result.current).toBe(false);
  });
});
