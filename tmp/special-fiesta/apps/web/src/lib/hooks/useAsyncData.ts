import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data-fetching primitive shared by every feature hook. Components stay free of loading and
 * error bookkeeping (AGENTS-frontend.md §1).
 *
 * `loader` MUST be stable — wrap it in useCallback at the call site.
 */

export interface AsyncData<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  reload: () => void;
}

export function describeError(error: unknown): string {
  // ApiError and OfflineError both extend Error and already carry the copy we want to show.
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

/**
 * ADR-024 — `isLoading` means "nothing to show yet", not "a request is in flight". A
 * surface that has data keeps showing it while the next poll runs, so a live board updates
 * in place instead of collapsing to "Loading…" and rebuilding itself every refresh.
 */
export function useAsyncData<T>(loader: () => Promise<T>): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    try {
      const result = await loader();
      if (!isMountedRef.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (!isMountedRef.current) return;
      setError(describeError(caught));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, error, isLoading, reload: () => void run() };
}

/**
 * ADR-024 — how long a live surface waits before asking again. Every wait is drawn afresh
 * from this window, per client, so two hundred phones that opened the board together do
 * not come back together: a fixed interval turns the crowd into a metronome pointed at the
 * one laptop running the event.
 */
export const POLL_MIN_MS = 45_000;
export const POLL_MAX_MS = 75_000;

export function nextPollDelay(random: () => number = Math.random): number {
  return Math.round(POLL_MIN_MS + random() * (POLL_MAX_MS - POLL_MIN_MS));
}

/** Re-runs `onTick` on a jittered schedule — court view, match feed, board, scan log. */
export function usePolling(onTick: () => void): void {
  const callbackRef = useRef(onTick);
  callbackRef.current = onTick;

  useEffect(() => {
    let timer = setTimeout(function tick() {
      callbackRef.current();
      timer = setTimeout(tick, nextPollDelay());
    }, nextPollDelay());
    return () => clearTimeout(timer);
  }, []);
}

/**
 * First non-null message from a set of async states. Hooks that own several requests report
 * one error to the component; chaining `??` inline is what pushes them over the complexity
 * limit and reads worse.
 */
export function firstError(candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}
