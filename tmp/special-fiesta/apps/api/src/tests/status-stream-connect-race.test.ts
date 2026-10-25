import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as AlertsModule from '../lib/alerts.js';
import { STATUS_ANNOUNCEMENT_EVENT, STATUS_SNAPSHOT_EVENT } from '@psd/contracts';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';
import { hasStatusSubscribers, resetStatusBusForTests } from '../lib/statusBus.js';

/**
 * ADR-121 — the frame published while the opening snapshot is still being read.
 *
 * The status stream subscribes to the bus BEFORE it reads the snapshot, and buffers anything
 * that arrives in between so it can be flushed once the snapshot is out. Drop that buffer and
 * the window is small but not theoretical: it is one indexed read wide, it is widest in exactly
 * the circumstances that matter (a restart, when three hundred phones reconnect at once and the
 * caches are cold — `docs/design/restart-behaviour.md` §4), and what falls into it is an
 * announcement, which is the one frame on this stream somebody is standing at a microphone
 * waiting to have delivered.
 *
 * The SSE mutation audit of 2026-10-05 (`docs/outstanding-tasks.md` §8, mutation S4) deleted
 * the buffer and the whole suite passed. The equivalent property on the chat room IS pinned —
 * another matched pair where one half was guarded and the other was not.
 *
 * **Why this file exists at all, and is not three more cases in `status-stream.test.ts`.**
 * Hitting that window by hand means publishing during an `await` nobody controls, which is a
 * race: it would pass on a quiet machine, fail on a loaded one, and be quietly deleted six
 * months later as "flaky". So the window is held open deliberately — `readAlertsFor` is wrapped
 * so the test decides when it returns. A gate like that has to be a module mock, a module mock
 * applies to the whole file, and the other nineteen tests in the suite want the real thing.
 */
const gate = vi.hoisted(() => {
  let release: (() => void) | null = null;
  let armed = false;
  let broken = false;
  let opened: (() => void) | null = null;
  return {
    /** The next snapshot read will hang until `release()`. */
    arm(): Promise<void> {
      armed = true;
      return new Promise<void>((resolve) => {
        opened = resolve;
      });
    },
    /** Called from inside the wrapped read; resolves the caller's `arm()` promise first. */
    async hold(): Promise<void> {
      if (!armed) return;
      armed = false;
      await new Promise<void>((resolve) => {
        release = resolve;
        opened?.();
        opened = null;
      });
    },
    release(): void {
      release?.();
      release = null;
    },
    /** The next snapshot read throws instead of answering. */
    breakOnce(): void {
      broken = true;
    },
    takeBroken(): boolean {
      const was = broken;
      broken = false;
      return was;
    },
  };
});

vi.mock('../lib/alerts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AlertsModule>();
  return {
    ...actual,
    readAlertsFor: async (...args: Parameters<typeof actual.readAlertsFor>) => {
      const snapshot = await actual.readAlertsFor(...args);
      // Held AFTER the real read, so the snapshot's contents are the pre-publish truth —
      // which is what makes the announcement below genuinely absent from it.
      await gate.hold();
      // Thrown after the hold, so a test can observe the handler mid-flight (subscribed,
      // nothing written) and only then push it down the failure path.
      if (gate.takeBroken()) throw new Error('the snapshot read fell over');
      return snapshot;
    },
  };
});

describe('ADR-121 — a frame published while the snapshot is in flight', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    gate.release();
    await ctx.close();
  });
  afterEach(() => {
    gate.release();
    resetStatusBusForTests();
  });

  it('is buffered and delivered, not dropped', async () => {
    const reader = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    // The handler will subscribe to the bus, read the snapshot, then hang inside it.
    const inTheWindow = gate.arm();
    const streamPromise = ctx.app.request('/api/status/stream', { headers: reader.headers });
    await inTheWindow;

    /*
     * Published with the socket subscribed and the snapshot not yet written. This is the frame
     * the buffer exists for: too late for the snapshot to contain it, too early for the live
     * path to carry it.
     */
    const said = await ctx.app.request(
      '/api/admin/announcements',
      jsonRequest({ body: 'Finals moved to court two' }, superadmin.headers),
    );
    expect(said.status).toBe(201);

    gate.release();
    const stream = await streamPromise;
    expect(stream.status).toBe(200);

    const body = stream.body;
    if (!body) throw new Error('The stream had no body');
    const reading = body.getReader();
    const decoder = new TextDecoder();
    let transcript = '';
    try {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const { value, done } = await reading.read();
        if (done) break;
        transcript += decoder.decode(value, { stream: true });
        if (transcript.includes('Finals moved to court two')) break;
      }
    } finally {
      await reading.cancel();
    }

    // The snapshot went out first and did NOT contain it — proof the window was real rather
    // than the test having simply published early.
    const snapshotFrame = transcript.split('\n\n')[0] ?? '';
    expect(snapshotFrame).toContain(`event: ${STATUS_SNAPSHOT_EVENT}`);
    expect(snapshotFrame).not.toContain('Finals moved to court two');

    // And the buffered frame followed it.
    expect(transcript).toContain(`event: ${STATUS_ANNOUNCEMENT_EVENT}`);
    expect(transcript).toContain('Finals moved to court two');
  });

  /**
   * §8 mutation S8 — the `finally` that gives the bus subscription back.
   *
   * `onAbort` covers the ordinary ending and IS pinned. The `finally` covers the other one: a
   * throw between subscribing and the heartbeat loop, where `onAbort` never fires because the
   * client never went anywhere. Without it the listener outlives the request, and the leak is
   * silent and cumulative — every failed connect during an incident leaves one behind, and the
   * next publish walks a list of dead sockets.
   *
   * Deleting the `finally` passed all 665 tests, because nothing in the suite had ever made a
   * stream handler throw. That is what the broken snapshot read below is for.
   */
  it('gives the subscription back when the snapshot read throws', async () => {
    const reader = await ctx.signUpParticipant();
    expect(hasStatusSubscribers()).toBe(false);

    /*
     * Held first, THEN broken. Holding is what makes the next assertion meaningful: it pins
     * the handler at a point where it has certainly subscribed, so "the listener went away"
     * is a statement about a listener that demonstrably existed. An earlier version polled
     * straight after a throwing read, found no subscriber, and passed — but it would have
     * passed just as happily if the handler had never subscribed at all.
     */
    const held = gate.arm();
    gate.breakOnce();
    const stream = await ctx.app.request('/api/status/stream', { headers: reader.headers });
    expect(stream.status).toBe(200);
    await held;
    expect(hasStatusSubscribers()).toBe(true);
    gate.release();
    /*
     * The body is deliberately NOT cancelled. Cancelling fires `onAbort`, which unsubscribes
     * too — so a version of this test that tidied up after itself passed with the `finally`
     * deleted and proved only that `onAbort` works, which was never in doubt. Leaving the
     * socket alone means the `finally` is the only thing that can give the listener back.
     */

    /*
     * Polled rather than asserted outright: the handler unwinds on its own microtask, so a
     * bare assertion here is a race against it rather than a statement about it.
     */
    for (let attempt = 0; attempt < 200 && hasStatusSubscribers(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(hasStatusSubscribers()).toBe(false);
  });
});
