import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, OfflineError } from '../api/client.js';
import {
  POLL_MAX_MS,
  POLL_MIN_MS,
  describeError,
  firstError,
  nextPollDelay,
  useAsyncData,
  usePolling,
} from './useAsyncData.js';

describe('useAsyncData', () => {
  afterEach(() => vi.useRealTimers());

  it('exposes data after the loader resolves', async () => {
    const loader = vi.fn(async () => ({ value: 42 }));
    const { result } = renderHook(() => useAsyncData(loader));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ value: 42 }));
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the message from an ApiError and can retry', async () => {
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new ApiError(409, 'Team name taken', 'teamName');
      return 'ok';
    });
    const { result } = renderHook(() => useAsyncData(loader));

    await waitFor(() => expect(result.current.error).toBe('Team name taken'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe('ok'));
  });

  it('describes an offline failure with the connection message', () => {
    expect(describeError(new OfflineError())).toContain("Can't reach Active Day");
  });

  it('falls back to a generic message for a thrown non-Error', () => {
    expect(describeError('kaboom')).toBe('Something went wrong.');
  });

  it('ignores a loader that settles after the surface is gone', async () => {
    let resolve: (value: string) => void = () => undefined;
    let reject: (reason: Error) => void = () => undefined;
    const settled = renderHook(() => useAsyncData(() => new Promise<string>((ok) => {
      resolve = ok;
    })));
    settled.unmount();
    act(() => resolve('too late'));

    const failed = renderHook(() => useAsyncData(() => new Promise<string>((_ok, no) => {
      reject = no;
    })));
    failed.unmount();
    act(() => reject(new Error('too late')));
  });

  it('keeps showing what it has while the next load runs (ADR-024)', async () => {
    let round = 0;
    const loader = vi.fn(async () => {
      round += 1;
      return `round ${round}`;
    });
    const { result } = renderHook(() => useAsyncData(loader));

    await waitFor(() => expect(result.current.data).toBe('round 1'));
    expect(result.current.isLoading).toBe(false);

    act(() => result.current.reload());
    // The surface never goes back to "nothing to show" — that is what made the board
    // blink and rebuild itself on every poll.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBe('round 1');
    await waitFor(() => expect(result.current.data).toBe('round 2'));
  });

  it('reports the first error among several async states', () => {
    expect(firstError([null, undefined, 'Team not found.', 'later'])).toBe('Team not found.');
    expect(firstError([null, undefined])).toBeNull();
  });
});

describe('usePolling (ADR-024)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws every wait from the 45–75 second window', () => {
    expect(nextPollDelay(() => 0)).toBe(POLL_MIN_MS);
    expect(nextPollDelay(() => 1)).toBe(POLL_MAX_MS);
    expect(nextPollDelay(() => 0.5)).toBe(60_000);
    // The real source of randomness stays inside the window too.
    const delays = Array.from({ length: 50 }, () => nextPollDelay());
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(POLL_MIN_MS);
    expect(Math.max(...delays)).toBeLessThanOrEqual(POLL_MAX_MS);
  });

  it('waits out a fresh random delay before each tick', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValue(0.5);
    const tick = vi.fn();
    renderHook(() => usePolling(tick));

    act(() => vi.advanceTimersByTime(POLL_MIN_MS - 1));
    expect(tick).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(tick).toHaveBeenCalledTimes(1);

    // The second wait is its own draw — 75s here, not another 45s.
    act(() => vi.advanceTimersByTime(POLL_MIN_MS));
    expect(tick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(POLL_MAX_MS - POLL_MIN_MS));
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the surface goes away', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const polled = renderHook(() => usePolling(tick));

    polled.unmount();
    act(() => vi.advanceTimersByTime(10 * POLL_MAX_MS));

    expect(tick).not.toHaveBeenCalled();
  });
});
