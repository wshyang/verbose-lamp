import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as EntitiesModule from '../db/entities/index.js';
import { TEAM_CHAT_TYPING_EVENT } from '@psd/contracts';
import { createTeam, createTestContext, jsonRequest, type TestContext } from './harness.js';
import { resetChatBusForTests } from '../lib/chatBus.js';

/**
 * ADR-123/146/155 — the team room's connect window, where three frame kinds take three
 * different paths and only one of them was pinned.
 *
 * `roomListener` buffers a **message**, drops a **typing** signal and drops a **hidden** frame
 * while the backlog replay is still running. Those are deliberate and documented, and the SSE
 * mutation audit of 2026-10-05 (`docs/outstanding-tasks.md` §8) found two of the three
 * guards survived deletion against the entire suite: T4, the cursor guard that stops a
 * buffered message being sent twice, and T3, the `pending.live` guard on typing.
 *
 * Both failures are the kind a reader blames on themselves. T4 shows the same line twice after
 * a Wi-Fi blip; T3 says "Marcus is typing…" about a sentence that arrived before the room
 * finished loading.
 *
 * Like the status stream's connect-race file beside this one, the window is held open
 * deliberately rather than raced for. The gate hangs the backlog read BEFORE it runs, so a
 * message sent inside the window is both committed (and therefore in the backlog when the read
 * finally happens) and already on the bus (and therefore in the buffer) — which is the exact
 * overlap the cursor guard exists to resolve, and is otherwise almost impossible to arrange.
 */
const gate = vi.hoisted(() => {
  let release: (() => void) | null = null;
  let armed = false;
  let opened: (() => void) | null = null;
  return {
    arm(): Promise<void> {
      armed = true;
      return new Promise<void>((resolve) => {
        opened = resolve;
      });
    },
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
  };
});

vi.mock('../db/entities/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EntitiesModule>();
  return {
    ...actual,
    readTeamChatMessages: async (...args: Parameters<typeof actual.readTeamChatMessages>) => {
      // Held BEFORE the real read, so anything sent inside the window is already committed
      // when the backlog is finally taken — and therefore appears in both halves.
      await gate.hold();
      return actual.readTeamChatMessages(...args);
    },
  };
});

interface Actor {
  headers: Record<string, string>;
  nickname: string;
  id: string;
}

describe('ADR-123 — the team room while its backlog is still being read', () => {
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
    resetChatBusForTests();
  });

  async function teamOfTwo(): Promise<{ captain: Actor; mate: Actor }> {
    const captain = await ctx.signUpParticipant();
    const mate = await ctx.signUpParticipant();
    await createTeam(ctx, captain, `Racers${captain.nickname.slice(-18)}`);
    const joined = await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: await joinCodeOf(captain) }, mate.headers),
    );
    expect(joined.status).toBe(201);
    return { captain, mate };
  }

  async function joinCodeOf(captain: Actor): Promise<string> {
    const mine = await ctx.json<{ team: { joinCode: string } }>(
      await ctx.app.request('/api/teams/mine', { headers: captain.headers }),
    );
    return mine.team.joinCode;
  }

  /** Pumps the socket until the needle lands or the budget runs out, then lets go. */
  async function transcriptUntil(response: Response, needle: string): Promise<string> {
    const body = response.body;
    if (!body) throw new Error('The stream had no body');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    try {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (text.includes(needle)) break;
      }
    } finally {
      await reader.cancel();
    }
    return text;
  }

  it('sends a message caught in the window exactly once, not twice', async () => {
    const { captain, mate } = await teamOfTwo();

    const inTheWindow = gate.arm();
    const streamPromise = ctx.app.request('/api/team-chat/stream', { headers: mate.headers });
    await inTheWindow;

    /*
     * Committed and published while the backlog read is held. When the read is released it
     * will return this row, and the buffer is holding the same row — so without the cursor
     * guard the socket writes it twice.
     */
    const said = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body: 'caught in the doorway' }, captain.headers),
    );
    expect(said.status).toBe(201);

    gate.release();
    const stream = await streamPromise;
    expect(stream.status).toBe(200);

    /*
     * A second, later line is what makes the count trustworthy. Reading only until the first
     * copy of the message arrives would stop the socket before any duplicate could land — an
     * earlier version of this test did exactly that, passed with the cursor guard deleted, and
     * was therefore worthless. Waiting for a line that is definitely AFTER both the backlog
     * flush and the buffer flush means everything either of them wrote has already been seen.
     */
    const later = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body: 'and a later line to read past' }, captain.headers),
    );
    expect(later.status).toBe(201);

    const text = await transcriptUntil(stream, 'and a later line to read past');
    expect(text).toContain('and a later line to read past');
    const hits = text.split('caught in the doorway').length - 1;
    expect(hits).toBe(1);
  });

  it('drops a typing signal that arrives before the replay finishes', async () => {
    const { captain, mate } = await teamOfTwo();

    const inTheWindow = gate.arm();
    const streamPromise = ctx.app.request('/api/team-chat/stream', { headers: mate.headers });
    await inTheWindow;

    const ping = await ctx.app.request('/api/team-chat/typing', jsonRequest({}, captain.headers));
    expect(ping.status).toBe(204);

    gate.release();
    const stream = await streamPromise;
    expect(stream.status).toBe(200);

    /*
     * Waits for a frame that SHOULD arrive, then asserts the one that should not did not.
     * Pumping for a fixed duration instead would pass just as happily on a socket that was
     * never written to at all.
     */
    const marker = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body: 'the replay has certainly finished by now' }, captain.headers),
    );
    expect(marker.status).toBe(201);

    const text = await transcriptUntil(stream, 'the replay has certainly finished by now');
    expect(text).toContain('the replay has certainly finished by now');
    // Held back, it would have described a sentence that has since been sent (ADR-146).
    expect(text).not.toContain(`event: ${TEAM_CHAT_TYPING_EVENT}`);
  });
});
