import { createRateLimiter } from './rateLimit.js';

/**
 * ADR-324 — a limit on guessing a credential.
 *
 * Every credential in this app is four digits, so ten thousand guesses reach any account, and the
 * superadmin's can restart the app and wipe the event. Only FAILED attempts spend the allowance,
 * so a correct sign-in is never slowed and a user who mistypes twice is not punished for it.
 *
 * It is keyed on the account being attacked, not on the caller's address. Behind the platform's
 * proxy every phone at the venue arrives from one address, so an address limit would lock the whole
 * event out after a handful of typos while doing nothing about a guesser who rotates addresses.
 * The accepted cost: someone who wants to deny the superadmin sign-in can keep that account
 * blocked with one wrong guess every 30 seconds. A session already signed in is unaffected, the
 * block never outlasts the attack, and the alternative is a four-digit credential with no limit.
 */

export type ThrottleKind = 'staff' | 'participant';

/** Wrong attempts before a block. A participant may share a phone with a friend who forgot their PIN. */
const CAPACITY: Record<ThrottleKind, number> = { staff: 5, participant: 10 };
/** One more attempt per this long while blocked: 10 000 guesses would take days, not an evening. */
const REFILL_MS = 30_000;

export interface SignInThrottle {
  isBlocked: (kind: ThrottleKind, name: string) => boolean;
  recordFailure: (kind: ThrottleKind, name: string) => void;
}

export interface SignInThrottleOptions {
  now?: () => number;
}

const keyOf = (kind: ThrottleKind, name: string): string => `${kind}:${name.trim().toLowerCase()}`;

export function createSignInThrottle(options: SignInThrottleOptions = {}): SignInThrottle {
  const now = options.now ?? Date.now;
  const limiters = {
    staff: createRateLimiter({ capacity: CAPACITY.staff, refillMs: REFILL_MS, now }),
    participant: createRateLimiter({ capacity: CAPACITY.participant, refillMs: REFILL_MS, now }),
  };
  return {
    isBlocked: (kind, name) => !limiters[kind].available(keyOf(kind, name)),
    recordFailure: (kind, name) => {
      limiters[kind].take(keyOf(kind, name));
    },
  };
}

let shared = createSignInThrottle();

/** The process-wide throttle the routes use. */
export function signInThrottle(): SignInThrottle {
  return shared;
}

/** The suite shares a module registry, so one test's failures must not block the next test's sign-in. */
export function resetSignInThrottleForTests(): void {
  shared = createSignInThrottle();
}
