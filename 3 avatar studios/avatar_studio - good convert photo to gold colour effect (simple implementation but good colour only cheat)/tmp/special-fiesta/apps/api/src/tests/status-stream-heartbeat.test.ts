import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { STATUS_HEARTBEAT_EVENT, STATUS_SNAPSHOT_EVENT } from '@psd/contracts';
import { createTestContext, type TestContext } from './harness.js';
import { resetStatusBusForTests } from '../lib/statusBus.js';

/**
 * ADR-043/119 — the heartbeat, which is the only reason a quiet socket survives the afternoon.
 *
 * Behind the Cloudflare tunnel an idle proxied connection is dropped at around a hundred
 * seconds. A status stream can easily be idle for that long — between announcements, with no
 * match on the team's court, nothing is published at all — so without a periodic frame the
 * socket is closed under the phone, and the phone's own evidence that it is still connected is
 * precisely that frames keep arriving (ADR-119).
 *
 * The SSE mutation audit of 2026-10-05 (`docs/outstanding-tasks.md` §8, mutation S9) deleted
 * the heartbeat write entirely and all 665 tests passed. Nothing anywhere asserted that this
 * stream ever says anything on its own. The failure it allows is the nastiest kind for an
 * event: everything works in the hall for the first ninety seconds of testing, and the room
 * goes silent once people settle.
 *
 * Fake timers, in a file of their own. The interval is twenty-five seconds and a suite cannot
 * wait for it; `vi.useFakeTimers` is installed only after every database call this test needs
 * has already happened, because PGlite's own scheduling must not be driven by the test clock.
 */
describe('ADR-121 — the status stream keeps itself alive', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetStatusBusForTests();
  });

  it('writes a heartbeat on a socket nobody has published to', async () => {
    const reader = await ctx.signUpParticipant();

    const stream = await ctx.app.request('/api/status/stream', { headers: reader.headers });
    expect(stream.status).toBe(200);
    const body = stream.body;
    if (!body) throw new Error('The stream had no body');
    const streamReader = body.getReader();
    const decoder = new TextDecoder();

    // The opening frame, on the real clock — it is written before any sleep.
    const opening = await streamReader.read();
    const snapshot = decoder.decode(opening.value, { stream: true });
    expect(snapshot).toContain(`event: ${STATUS_SNAPSHOT_EVENT}`);

    vi.useFakeTimers();
    const next = streamReader.read();
    // Past the twenty-five second interval, with nothing whatsoever published in between.
    await vi.advanceTimersByTimeAsync(26_000);
    const beat = await next;

    expect(decoder.decode(beat.value, { stream: true })).toContain(
      `event: ${STATUS_HEARTBEAT_EVENT}`,
    );
    await streamReader.cancel();
    // Bounded: with the heartbeat deleted this read never resolves, and a sixty-second
    // default makes a red build slow as well as red.
  }, 15_000);
});
