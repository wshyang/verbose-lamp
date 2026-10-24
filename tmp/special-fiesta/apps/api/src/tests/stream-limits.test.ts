import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { overrideEnv, getEnv } from '../env.js';
import { STREAMS_PER_SESSION, createStreamCounter } from '../lib/streamLimits.js';
import { resetChatBusForTests } from '../lib/chatBus.js';
import { resetStatusBusForTests } from '../lib/statusBus.js';
import { resetStreamLimitsForTests } from '../lib/streamLimits.js';
import { createTeam, createTestContext, type TestContext } from './harness.js';

/**
 * ADR-324 — the number of open event streams is bounded.
 *
 * A stream costs a socket and a bus listener, not a database connection, so a few hundred is
 * ordinary. What was missing was any ceiling: a client that reconnects in a loop, or a script
 * opening streams, grew the listener lists and the open sockets without limit, and every
 * published frame then walks all of them. Past the ceiling a stream is refused with a 429, and
 * the client's reconnect backoff (ADR-122) is the retry.
 */
describe('createStreamCounter', () => {
  it('admits up to the global ceiling, refuses past it, and frees a place on release', () => {
    const counter = createStreamCounter({ globalLimit: 2, perSessionLimit: 5 });
    const a = counter.tryOpen('s1');
    const b = counter.tryOpen('s2');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(counter.tryOpen('s3')).toBeNull();
    a?.();
    expect(counter.tryOpen('s3')).not.toBeNull();
  });

  it('limits one session separately, so one phone cannot use the whole ceiling', () => {
    const counter = createStreamCounter({ globalLimit: 100, perSessionLimit: 3 });
    expect(counter.tryOpen('s1')).not.toBeNull();
    expect(counter.tryOpen('s1')).not.toBeNull();
    expect(counter.tryOpen('s1')).not.toBeNull();
    expect(counter.tryOpen('s1')).toBeNull();
    expect(counter.tryOpen('s2')).not.toBeNull();
  });

  it('counts a release once however often it is called', () => {
    const counter = createStreamCounter({ globalLimit: 1, perSessionLimit: 1 });
    const release = counter.tryOpen('s1');
    release?.();
    release?.();
    release?.();
    expect(counter.tryOpen('s1')).not.toBeNull();
    expect(counter.tryOpen('s2')).toBeNull();
    expect(counter.openCount()).toBe(1);
  });

  it('forgets a session once all of its streams are closed', () => {
    const counter = createStreamCounter({ globalLimit: 10, perSessionLimit: 3 });
    const release = counter.tryOpen('gone');
    release?.();
    expect(counter.sessionCount()).toBe(0);
  });
});

describe('the stream routes', () => {
  let ctx: TestContext;
  const defaultLimit = getEnv().SSE_MAX_STREAMS;
  beforeEach(async () => {
    overrideEnv({ SSE_MAX_STREAMS: defaultLimit });
    resetStreamLimitsForTests();
    ctx = await createTestContext();
  });
  afterEach(async () => {
    overrideEnv({ SSE_MAX_STREAMS: defaultLimit });
    resetStreamLimitsForTests();
    resetStatusBusForTests();
    resetChatBusForTests();
    await ctx.close();
  });

  it('refuses a stream past the per-session limit with 429 and a plain JSON error', async () => {
    const participant = await ctx.signUpParticipant();
    const open = [];
    for (let stream = 0; stream < STREAMS_PER_SESSION; stream += 1) {
      const response = await ctx.app.request('/api/chat/stream', { headers: participant.headers });
      expect(response.status).toBe(200);
      open.push(response);
    }
    const refused = await ctx.app.request('/api/chat/stream', { headers: participant.headers });
    expect(refused.status).toBe(429);
    const body = await ctx.json<{ error: { message: string } }>(refused);
    expect(body.error.message.length).toBeGreaterThan(0);
    for (const response of open) await response.body?.cancel();
  });

  it('gives the place back when the client goes away, so a reconnecting phone is not locked out', async () => {
    const participant = await ctx.signUpParticipant();
    for (let round = 0; round < 6; round += 1) {
      const response = await ctx.app.request('/api/chat/stream', { headers: participant.headers });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  });

  it.each([
    ['status', '/api/status/stream', false],
    ['team chat', '/api/team-chat/stream', true],
  ])('gives the place back when a %s stream ends, so reconnects never lock the phone out', async (_name, path, needsTeam) => {
    const participant = await ctx.signUpParticipant();
    if (needsTeam) await createTeam(ctx, participant, `Rel${participant.nickname.slice(-20)}`);
    // More reconnects than the per-session limit: if a place leaked each time, the last would be a 429.
    for (let round = 0; round < STREAMS_PER_SESSION + 3; round += 1) {
      const response = await ctx.app.request(path, { headers: participant.headers });
      expect(response.status).toBe(200);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });

  it('counts the three kinds of stream against the same session', async () => {
    const captain = await ctx.signUpParticipant();
    await createTeam(ctx, captain, `Cap${captain.nickname.slice(-20)}`);
    // One of each kind, then a second of the first kind: four in all, the limit.
    const open = [
      await ctx.app.request('/api/chat/stream', { headers: captain.headers }),
      await ctx.app.request('/api/status/stream', { headers: captain.headers }),
      await ctx.app.request('/api/team-chat/stream', { headers: captain.headers }),
      await ctx.app.request('/api/chat/stream', { headers: captain.headers }),
    ];
    for (const response of open) expect(response.status).toBe(200);
    // A fifth of ANY kind is refused: the three kinds share one allowance per session.
    expect((await ctx.app.request('/api/status/stream', { headers: captain.headers })).status).toBe(429);
    for (const response of open) await response.body?.cancel();
  });

  it('refuses past the global ceiling', async () => {
    overrideEnv({ SSE_MAX_STREAMS: 2 });
    resetStreamLimitsForTests();
    const a = await ctx.signUpParticipant();
    const b = await ctx.signUpParticipant();
    const c = await ctx.signUpParticipant();
    const first = await ctx.app.request('/api/chat/stream', { headers: a.headers });
    const second = await ctx.app.request('/api/chat/stream', { headers: b.headers });
    const third = await ctx.app.request('/api/chat/stream', { headers: c.headers });
    expect([first.status, second.status, third.status]).toEqual([200, 200, 429]);
    await first.body?.cancel();
    await second.body?.cancel();
  });
});
