import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStreamWatchdog, STREAM_STALE_MS } from './streamWatchdog.js';

/**
 * ADR-119 — the timer that decides a silent socket is a dead socket.
 *
 * The interesting cases are the two that keep it from crying wolf: a frame of any kind must
 * restart the clock, and a stopped watchdog must never fire — a stream torn down at unmount
 * would otherwise reconnect a room nobody is looking at.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('createStreamWatchdog', () => {
  it('fires once the stale window passes with no frame', () => {
    vi.useFakeTimers();
    const onStale = vi.fn();
    const watchdog = createStreamWatchdog(onStale);

    watchdog.touch();
    vi.advanceTimersByTime(STREAM_STALE_MS - 1);
    expect(onStale).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  /* A heartbeat every 25s against a 70s window: the clock must restart, or a healthy stream dies. */
  it('restarts the clock on every frame', () => {
    vi.useFakeTimers();
    const onStale = vi.fn();
    const watchdog = createStreamWatchdog(onStale);

    for (let beat = 0; beat < 10; beat += 1) {
      watchdog.touch();
      vi.advanceTimersByTime(25_000);
    }

    expect(onStale).not.toHaveBeenCalled();
  });

  it('never fires after it is stopped', () => {
    vi.useFakeTimers();
    const onStale = vi.fn();
    const watchdog = createStreamWatchdog(onStale);

    watchdog.touch();
    watchdog.stop();
    vi.advanceTimersByTime(10 * STREAM_STALE_MS);

    expect(onStale).not.toHaveBeenCalled();
  });

  /* `touch` after `stop` is what a late frame on a closing socket looks like. */
  it('stays stopped when a frame arrives after the stream closed', () => {
    vi.useFakeTimers();
    const onStale = vi.fn();
    const watchdog = createStreamWatchdog(onStale);

    watchdog.stop();
    watchdog.touch();
    vi.advanceTimersByTime(10 * STREAM_STALE_MS);

    expect(onStale).not.toHaveBeenCalled();
  });
});
