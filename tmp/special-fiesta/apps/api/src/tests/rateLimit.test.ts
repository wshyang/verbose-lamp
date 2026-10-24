import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../lib/rateLimit.js';

/**
 * ADR-046 — the bucket, with the clock in the test's hand rather than the wall's. Proving a
 * two-second refill rule by sleeping two seconds is a test nobody runs twice.
 */

function limiterAt(clock: { ms: number }) {
  return createRateLimiter({ capacity: 2, refillMs: 1_000, now: () => clock.ms });
}

describe('the send bucket', () => {
  it('allows a burst up to capacity, then refuses', () => {
    const clock = { ms: 0 };
    const limiter = limiterAt(clock);

    expect(limiter.take('session-a')).toBe(true);
    expect(limiter.take('session-a')).toBe(true);
    expect(limiter.take('session-a')).toBe(false);
  });

  it('gives a token back once the refill interval has passed', () => {
    const clock = { ms: 0 };
    const limiter = limiterAt(clock);
    limiter.take('session-a');
    limiter.take('session-a');

    clock.ms = 1_000;

    expect(limiter.take('session-a')).toBe(true);
    expect(limiter.take('session-a')).toBe(false);
  });

  it('never refills past capacity, however long the room stays quiet', () => {
    const clock = { ms: 0 };
    const limiter = limiterAt(clock);
    limiter.take('session-a');
    limiter.take('session-a');

    clock.ms = 60_000;

    expect(limiter.take('session-a')).toBe(true);
    expect(limiter.take('session-a')).toBe(true);
    expect(limiter.take('session-a')).toBe(false);
  });

  it('counts each session separately, so one chatty phone cannot mute another', () => {
    const clock = { ms: 0 };
    const limiter = limiterAt(clock);

    limiter.take('session-a');
    limiter.take('session-a');

    expect(limiter.take('session-a')).toBe(false);
    expect(limiter.take('session-b')).toBe(true);
  });
});


describe('peeking and eviction (ADR-324)', () => {
  it('available() reports whether a token is left without spending one', () => {
    const clock = { ms: 0 };
    const limiter = limiterAt(clock);
    expect(limiter.available('k')).toBe(true);
    expect(limiter.available('k')).toBe(true);
    limiter.take('k');
    limiter.take('k');
    expect(limiter.available('k')).toBe(false);
    clock.ms = 1_000;
    expect(limiter.available('k')).toBe(true);
  });

  it('forgets a key once it has fully refilled, so the map does not grow with every name ever tried', () => {
    const clock = { ms: 0 };
    const limiter = createRateLimiter({ capacity: 2, refillMs: 1_000, now: () => clock.ms, sweepAbove: 3 });
    for (const key of ['a', 'b', 'c', 'd']) limiter.take(key);
    expect(limiter.size()).toBe(4);
    clock.ms = 10_000;
    limiter.take('e');
    expect(limiter.size()).toBe(1);
  });

  it('never forgets a key that is still empty: eviction must not hand back a spent allowance', () => {
    const clock = { ms: 0 };
    const limiter = createRateLimiter({ capacity: 1, refillMs: 60_000, now: () => clock.ms, sweepAbove: 1 });
    limiter.take('victim');
    for (const key of ['x', 'y', 'z']) limiter.take(key);
    expect(limiter.available('victim')).toBe(false);
  });
});
