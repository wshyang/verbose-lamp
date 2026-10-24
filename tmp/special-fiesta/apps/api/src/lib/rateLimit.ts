/**
 * A token bucket, in memory, keyed by whatever the caller considers an identity (ADR-046).
 *
 * In memory is correct for the same reason the chat bus is an EventEmitter: one process, so
 * there is no second process whose count would need reconciling. It is deliberately NOT a
 * middleware over every route — the only thing that needs throttling is the one route where a
 * held-down send key turns into unbounded INSERTs.
 *
 * The clock is injected so the tests can prove refill behaviour without sleeping. A test that
 * waits two real seconds to check a two-second rule is a test nobody runs twice.
 */

export interface RateLimiterOptions {
  /** Bucket depth: how many sends may burst before the refill rate governs. */
  capacity: number;
  /** How long one token takes to come back. */
  refillMs: number;
  /** Injected for tests; defaults to the wall clock. */
  now?: () => number;
  /**
   * ADR-324 — once more keys than this are held, fully-refilled ones are dropped on the next take.
   * A key that is back at capacity is indistinguishable from one never seen, so dropping it loses
   * nothing; a key still short of capacity is never dropped, so eviction cannot hand back a spent
   * allowance. Keys that are guessable input (a nickname typed at sign-in) make "a few hundred
   * sessions" no longer true of the map's size.
   */
  sweepAbove?: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const DEFAULT_SWEEP_ABOVE = 5_000;

export interface RateLimiter {
  /** Spends a token if one is available. `false` means the caller should refuse the request. */
  take: (key: string) => boolean;
  /** Whether a token is left, without spending it. */
  available: (key: string) => boolean;
  /** How many keys are held; for the eviction test and for operators. */
  size: () => number;
  /** Drops all buckets. Tests use it; nothing in production should need it. */
  reset: () => void;
}

/**
 * Chat keys on a session id, of which an event has a few hundred, so those buckets are simply kept.
 * Sign-in keys on a name the caller typed, which is unbounded, so the map sweeps fully-refilled
 * buckets once it passes `sweepAbove` (default 5 000).
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { capacity, refillMs } = options;
  const clock = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  const sweepAbove = options.sweepAbove ?? DEFAULT_SWEEP_ABOVE;

  const refilled = (bucket: Bucket, atMs: number): Bucket => {
    const earned = Math.floor((atMs - bucket.lastRefillMs) / refillMs);
    if (earned <= 0) return bucket;
    return {
      tokens: Math.min(capacity, bucket.tokens + earned),
      lastRefillMs: bucket.lastRefillMs + earned * refillMs,
    };
  };

  const sweep = (atMs: number): void => {
    if (buckets.size <= sweepAbove) return;
    for (const [key, bucket] of buckets) {
      if (refilled(bucket, atMs).tokens >= capacity) buckets.delete(key);
    }
  };

  return {
    available: (key) => {
      const bucket = buckets.get(key);
      return bucket === undefined || refilled(bucket, clock()).tokens > 0;
    },
    size: () => buckets.size,
    take: (key) => {
      const atMs = clock();
      sweep(atMs);
      const existing = buckets.get(key) ?? { tokens: capacity, lastRefillMs: atMs };
      const bucket = refilled(existing, atMs);
      if (bucket.tokens <= 0) {
        buckets.set(key, bucket);
        return false;
      }
      buckets.set(key, { tokens: bucket.tokens - 1, lastRefillMs: bucket.lastRefillMs });
      return true;
    },
    reset: () => {
      buckets.clear();
    },
  };
}
