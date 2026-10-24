import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSignInThrottle, resetSignInThrottleForTests } from '../lib/signInThrottle.js';
import { createTestContext, jsonRequest, SUPERADMIN_PASSCODE, type TestContext } from './harness.js';

/**
 * ADR-324 — sign-in used to have no limit at all, and every credential is a four-digit PIN: ten
 * thousand guesses reached any account, the superadmin's included, and a superadmin can restart
 * the app and wipe the event.
 *
 * The throttle counts FAILED attempts only, keyed on the account being attacked. It does not key
 * on the caller's address: behind the platform's proxy every phone shares one, so a per-address
 * limit would lock the whole event out after a handful of typos.
 */
describe('createSignInThrottle', () => {
  it('lets a correct sign-in through any number of times: successes cost nothing', () => {
    const throttle = createSignInThrottle({ now: () => 0 });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(throttle.isBlocked('staff', 'Superadmin')).toBe(false);
    }
  });

  it('blocks an account after its failures run out, and unblocks it as the allowance refills', () => {
    const clock = { ms: 0 };
    const throttle = createSignInThrottle({ now: () => clock.ms });
    for (let failure = 0; failure < 5; failure += 1) throttle.recordFailure('staff', 'superadmin');
    expect(throttle.isBlocked('staff', 'superadmin')).toBe(true);
    clock.ms = 30_000;
    expect(throttle.isBlocked('staff', 'superadmin')).toBe(false);
  });

  it('keeps accounts apart, and treats a name case-insensitively so "ADMIN1" cannot dodge the count for "admin1"', () => {
    const throttle = createSignInThrottle({ now: () => 0 });
    for (let failure = 0; failure < 5; failure += 1) throttle.recordFailure('staff', 'Admin1');
    expect(throttle.isBlocked('staff', 'admin1')).toBe(true);
    expect(throttle.isBlocked('staff', 'admin2')).toBe(false);
    expect(throttle.isBlocked('participant', 'admin1')).toBe(false);
  });

  it('is more patient with participants than with staff', () => {
    const throttle = createSignInThrottle({ now: () => 0 });
    for (let failure = 0; failure < 5; failure += 1) throttle.recordFailure('participant', 'wavy');
    expect(throttle.isBlocked('participant', 'wavy')).toBe(false);
    for (let failure = 0; failure < 5; failure += 1) throttle.recordFailure('participant', 'wavy');
    expect(throttle.isBlocked('participant', 'wavy')).toBe(true);
  });
});

describe('sign-in routes', () => {
  let ctx: TestContext;
  beforeEach(async () => {
    resetSignInThrottleForTests();
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await ctx.close();
    resetSignInThrottleForTests();
  });

  const staffAttempt = (passcode: string) =>
    ctx.app.request('/api/auth/superadmins/signin', jsonRequest({ username: 'superadmin', passcode }));

  it('answers 429 once the superadmin account has had five wrong passcodes — and then refuses the RIGHT one too', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await staffAttempt('0000')).status).toBe(401);
    const blocked = await staffAttempt('0000');
    expect(blocked.status).toBe(429);
    // The point of the block: a correct guess made while blocked is not allowed to succeed.
    const correct = await staffAttempt(SUPERADMIN_PASSCODE);
    expect(correct.status).toBe(429);
    expect(correct.headers.get('set-cookie')).toBeNull();
  });

  it('does not count successes against the account', async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await staffAttempt(SUPERADMIN_PASSCODE)).status).toBe(200);
    }
  });

  it('does not let wrong guesses at one account block another', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) await staffAttempt('0000');
    expect((await staffAttempt('0000')).status).toBe(429);
    // A different account, on the same route, is untouched: it still answers 401 for a wrong
    // passcode (a real check), not 429.
    const other = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'someoneelse', passcode: '0000' }),
    );
    expect(other.status).toBe(401);
    // And so is the facilitator route, which keys on its own namespace.
    const facilitator = await ctx.app.request(
      '/api/auth/facilitators/signin',
      jsonRequest({ username: 'superadmin', passcode: '0000' }),
    );
    expect(facilitator.status).toBe(401);
  });

  it('throttles participant sign-in by nickname', async () => {
    const participant = await ctx.signUpParticipant();
    const wrong = () =>
      ctx.app.request('/api/auth/participants/signin', jsonRequest({ nickname: participant.nickname, pin: '0000' }));
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await wrong()).status).toBe(401);
    expect((await wrong()).status).toBe(429);
  });

  it('writes nothing when it refuses: no session row is created for a blocked correct passcode', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await staffAttempt('0000');
    await staffAttempt(SUPERADMIN_PASSCODE);
    const rows = (await ctx.handle.runSql("select count(*)::int as n from session where actor_type = 'superadmin'")) as {
      rows?: Array<{ n: number }>;
    };
    expect(rows.rows?.[0]?.n ?? 0).toBe(0);
  });
});
