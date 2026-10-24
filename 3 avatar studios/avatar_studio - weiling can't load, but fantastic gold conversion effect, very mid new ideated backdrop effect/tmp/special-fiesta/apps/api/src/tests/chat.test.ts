import { CHAT_BODY_MAX_LENGTH, CHAT_HIDDEN_EVENT, messages } from '@psd/contracts';
import type { ChatMessageView, ChatPageView } from '@psd/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { skipsCompression } from '../app.js';
import { chatSubscriberCountForTests, resetChatBusForTests } from '../lib/chatBus.js';
import { createChatMessage } from '../db/entities/index.js';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

type ChatPage = ChatPageView;

/**
 * The chat room (ADR-046), against the real app and a real database.
 *
 * The streaming tests matter most. SSE was chosen over WebSockets *because* an SSE route stays
 * exercisable through `app.request()` with no listening socket, preserving the repo's
 * integration-test doctrine — so if the stream were only asserted indirectly, the whole reason
 * for the transport choice would go unproven.
 */

interface SendResult {
  message: ChatMessageView;
}

interface PageResult {
  messages: ChatMessageView[];
}

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

afterEach(() => {
  // A listener that outlived its test would receive the next test's messages.
  resetChatBusForTests();
});

async function send(headers: Record<string, string>, body: string): Promise<Response> {
  return ctx.app.request('/api/chat/messages', jsonRequest({ body }, headers));
}

describe('sending to the room', () => {
  it('stores a participant message under their nickname and cluster', async () => {
    const participant = await ctx.signUpParticipant();

    const response = await send(participant.headers, 'Court 3 is free!');

    expect(response.status).toBe(201);
    const { message } = await ctx.json<SendResult>(response);
    expect(message.body).toBe('Court 3 is free!');
    expect(message.authorType).toBe('participant');
    expect(message.authorLabel).toBe(participant.nickname);
    expect(message.clusterCode).toBe(participant.clusterCode);
    expect(message.authorParticipantId).toBe(participant.id);
  });

  it('lets staff post under their username, visibly as staff', async () => {
    const facilitator = await ctx.createFacilitator();

    const response = await send(facilitator.headers, 'Everyone to the main tent.');

    expect(response.status).toBe(201);
    const { message } = await ctx.json<SendResult>(response);
    expect(message.authorType).toBe('facilitator');
    expect(message.authorLabel).toBe(facilitator.username);
    expect(message.clusterCode).toBeNull();
  });

  it('lets the superadmin post under their username too', async () => {
    const superadmin = await ctx.signInSuperadmin();

    const response = await send(superadmin.headers, 'Prize-giving starts in ten minutes.');

    // The third author kind, and the one with the most authority in the room: the label is
    // snapshotted at write time like everybody else's, so a later rename cannot rewrite what
    // the room was told (AGENTS.md non-negotiable #7).
    expect(response.status).toBe(201);
    const { message } = await ctx.json<SendResult>(response);
    expect(message.authorType).toBe('superadmin');
    expect(message.authorLabel).toBe('superadmin');
    expect(message.clusterCode).toBeNull();
  });

  it('refuses a signed-out sender', async () => {
    const response = await send({}, 'hello?');

    expect(response.status).toBe(401);
  });

  it('refuses an empty message with the contract wording', async () => {
    const participant = await ctx.signUpParticipant();

    const response = await send(participant.headers, '   ');

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.chatMessageEmpty);
  });

  it('caps the body, because the cap is what bounds the table', async () => {
    const participant = await ctx.signUpParticipant();

    const response = await send(participant.headers, 'x'.repeat(CHAT_BODY_MAX_LENGTH + 1));

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.chatMessageTooLong);
  });

  it('throttles a held-down send key instead of taking every insert', async () => {
    const participant = await ctx.signUpParticipant();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await send(participant.headers, `burst ${attempt}`);
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
    // The bucket has depth, so the first sends are accepted rather than the room feeling laggy.
    expect(statuses[0]).toBe(201);
  });
});

describe('catching up on what was missed', () => {
  it('returns messages after a cursor, and nothing before it', async () => {
    const participant = await ctx.signUpParticipant();
    const first = await ctx.json<SendResult>(await send(participant.headers, 'one'));
    const second = await ctx.json<SendResult>(await send(participant.headers, 'two'));

    const response = await ctx.app.request(`/api/chat/messages?after=${first.message.id}`, {
      headers: participant.headers,
    });

    expect(response.status).toBe(200);
    const page = await ctx.json<PageResult>(response);
    const ids = page.messages.map((message) => message.id);
    expect(ids).toContain(second.message.id);
    expect(ids).not.toContain(first.message.id);
  });

  it('rejects a cursor that is not an id', async () => {
    const participant = await ctx.signUpParticipant();

    const response = await ctx.app.request('/api/chat/messages?after=yesterday', {
      headers: participant.headers,
    });

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.chatCursorInvalid);
  });

  it('refuses to show the room to someone signed out', async () => {
    const response = await ctx.app.request('/api/chat/messages');

    expect(response.status).toBe(401);
  });
});

describe('moderation', () => {
  it('hides a message for everyone once a superadmin hides it', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const { message } = await ctx.json<SendResult>(
      await send(participant.headers, 'something regrettable'),
    );

    const hidden = await ctx.app.request(
      `/api/chat/messages/${message.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(hidden.status).toBe(200);

    const page = await ctx.json<PageResult>(
      await ctx.app.request('/api/chat/messages', { headers: participant.headers }),
    );
    expect(page.messages.map((entry) => entry.id)).not.toContain(message.id);
  });

  it('does not let a participant hide a message — wrong party, valid session', async () => {
    const author = await ctx.signUpParticipant();
    const bystander = await ctx.signUpParticipant();
    const { message } = await ctx.json<SendResult>(await send(author.headers, 'keep me'));

    const response = await ctx.app.request(
      `/api/chat/messages/${message.id}/hide`,
      jsonRequest({}, bystander.headers),
    );

    expect(response.status).toBe(403);
  });

  it('does not let a facilitator hide a message either', async () => {
    const author = await ctx.signUpParticipant();
    const facilitator = await ctx.createFacilitator();
    const { message } = await ctx.json<SendResult>(await send(author.headers, 'also keep me'));

    const response = await ctx.app.request(
      `/api/chat/messages/${message.id}/hide`,
      jsonRequest({}, facilitator.headers),
    );

    expect(response.status).toBe(403);
  });
});

/**
 * Reads SSE frames until one contains `needle`, then cancels and returns everything seen.
 *
 * It waits for a needle rather than for a frame count because every test in this file shares
 * one room: by the time the stream tests run, the backlog already holds what the earlier tests
 * said, and the interesting frame is somewhere after it. `maxFrames` keeps a genuine failure a
 * failed assertion rather than a hung suite.
 *
 * Cancelling is also what fires the stream's abort handler, which is how the heartbeat loop
 * learns to stop — so this helper doubles as the proof that a closed connection is cleaned up.
 */
async function framesUntil(response: Response, needle: string, maxFrames = 400): Promise<string[]> {
  const body = response.body;
  if (!body) throw new Error('The stream had no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const seen: string[] = [];
  let buffered = '';
  try {
    while (seen.length < maxFrames) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const parts = buffered.split('\n\n');
      buffered = parts.pop() ?? '';
      seen.push(...parts.filter((part) => part.trim() !== ''));
      if (seen.some((frame) => frame.includes(needle))) break;
    }
  } finally {
    await reader.cancel();
  }
  return seen;
}

/**
 * The same read as one blob, for assertions that only care whether a phrase arrived. Anything
 * asserting on a single frame's *fields* — ADR-065's moderation frame and the `id:` it must not
 * carry — has to keep the frames apart, so it uses `framesUntil` directly.
 */
async function readUntil(response: Response, needle: string, maxFrames = 400): Promise<string> {
  return (await framesUntil(response, needle, maxFrames)).join('\n');
}

/** Pumps whatever arrives for a bounded window, for assertions that a frame does NOT come. */
async function readFor(response: Response, ms: number): Promise<string> {
  const body = response.body;
  if (!body) throw new Error('The stream had no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Cancelling the reader is how this ends; not a failure.
    }
  })();
  await new Promise((resolve) => setTimeout(resolve, ms));
  await reader.cancel();
  await pump;
  return chunks.join('');
}

describe('the live stream', () => {
  it('is exempt from gzip, because a buffered stream is a stalled one', () => {
    expect(skipsCompression('/api/chat/stream')).toBe(true);
    expect(skipsCompression('/api/status/stream')).toBe(true);
    /*
     * ADR-185 — the one that was missing. Team chat shipped its own SSE endpoint and was never
     * added to what used to be a hand-kept list, so its frames sat in the gzip buffer instead
     * of reaching the phone. The rule is a shape now, so the next stream cannot be forgotten.
     */
    expect(skipsCompression('/api/team-chat/stream')).toBe(true);
    // Not every path with a segment called stream: only an SSE endpoint at the end of a group.
    expect(skipsCompression('/api/chat/stream/extra')).toBe(false);
    expect(skipsCompression('/api/chat/messages')).toBe(false);
    // The carve-out must stay narrow: ADR-034's measured board result depends on it.
    expect(skipsCompression('/api/leaderboard')).toBe(false);
    expect(skipsCompression('/api/chat/messages')).toBe(false);
  });

  it('hands each phone its own reconnect delay before anything else', async () => {
    const participant = await ctx.signUpParticipant();

    const delays: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const stream = await ctx.app.request('/api/chat/stream', { headers: participant.headers });
      const frames = await framesUntil(stream, 'retry:', 4);
      const line = (frames[0] ?? '').split('\n').find((part) => part.startsWith('retry:'));
      delays.push(Number((line ?? '').replace(/^retry:\s*/, '')));
    }

    /*
     * ADR-122 — without this the room reconnects on the browser's fixed default, which is the
     * lockstep the status stream was already fixed for: everything that drops one of these
     * sockets drops all of them in the same instant.
     */
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(3_000);
      expect(delay).toBeLessThan(10_000);
    }
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('replays the backlog to a phone that has just opened the room', async () => {
    const participant = await ctx.signUpParticipant();
    await send(participant.headers, 'said before you arrived');

    const stream = await ctx.app.request('/api/chat/stream', { headers: participant.headers });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');

    expect(await readUntil(stream, 'said before you arrived')).toContain(
      'said before you arrived',
    );
  });

  it('never re-sends at or below the cursor it resumed from', async () => {
    const participant = await ctx.signUpParticipant();

    /*
     * A resumed stream carries its high-water mark, and the guard is on the *push* path as
     * well as the replay: a frame from the bus that is not newer than what this connection
     * has already sent must be dropped, or a reconnect mid-send shows the same line twice.
     * The cursor here is past every UUIDv7 there will ever be, which makes "not newer"
     * deterministic rather than a race.
     */
    const beyondEverything = 'ffffffff-ffff-7fff-bfff-ffffffffffff';
    const stream = await ctx.app.request(`/api/chat/stream?after=${beyondEverything}`, {
      headers: participant.headers,
    });
    expect(stream.status).toBe(200);

    const transcript = readFor(stream, 600);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await send(participant.headers, 'older than the cursor says');

    expect(await transcript).not.toContain('older than the cursor says');
  });

  it('pushes a message that is sent while the stream is open', async () => {
    const listener = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();

    const stream = await ctx.app.request('/api/chat/stream', { headers: listener.headers });
    const framesPromise = readUntil(stream, 'pushed while you watched');
    await send(talker.headers, 'pushed while you watched');

    expect(await framesPromise).toContain('pushed while you watched');
  });

  it('resumes from Last-Event-ID without re-sending what was already seen', async () => {
    const participant = await ctx.signUpParticipant();
    const first = await ctx.json<SendResult>(await send(participant.headers, 'already seen'));
    await send(participant.headers, 'missed while away');

    const stream = await ctx.app.request('/api/chat/stream', {
      headers: { ...participant.headers, 'last-event-id': first.message.id },
    });

    const text = await readUntil(stream, 'missed while away');
    expect(text).toContain('missed while away');
    // The cursor is a UUIDv7, so everything said at or before it is excluded by id comparison.
    expect(text).not.toContain('already seen');
  });

  it('refuses a stream to someone signed out', async () => {
    const response = await ctx.app.request('/api/chat/stream');

    expect(response.status).toBe(401);
  });

});

describe('ADR-065 — paging back through history', () => {
  /**
   * The room opens on fifty and fetches older pages only if somebody scrolls for them. Fifty-five
   * messages is the smallest number that proves both halves: the tail is capped, and exactly the
   * remainder comes back behind it.
   */
  async function roomOf(count: number) {
    const talker = await ctx.signUpParticipant();
    /*
     * Written through the repository rather than the route. `POST /messages` is rate limited to
     * three per two seconds (ADR-046) and this test is about reading history, not about how fast a
     * phone may post — driving the limiter here would only measure `setTimeout`.
     */
    for (let at = 0; at < count; at += 1) {
      await createChatMessage(ctx.handle.db, {
        authorType: 'participant',
        participantId: talker.id,
        facilitatorId: null,
        superadminId: null,
        authorLabelSnapshot: talker.nickname,
        clusterCodeSnapshot: 'CS',
        body: `line ${at}`,
      });
    }
    return talker;
  }

  it('opens on the newest fifty and says there is more behind them', async () => {
    const talker = await roomOf(55);

    const opening = await ctx.app.request('/api/chat/messages', { headers: talker.headers });
    const page = await ctx.json<ChatPage>(opening);

    expect(page.messages).toHaveLength(50);
    // Oldest first within the page, and it is the TAIL of the room, not its beginning.
    expect(page.messages[0]?.body).toBe('line 5');
    expect(page.messages.at(-1)?.body).toBe('line 54');
  });

  it('walks backwards to the start of the room and then stops asking', async () => {
    /*
     * Deliberately not asserting exact bodies: this context is shared across the file, so the room
     * already holds whatever earlier tests said. What matters is the property — paging back
     * TERMINATES, pages do not overlap, and each is strictly older than the one before it.
     */
    const talker = await roomOf(55);
    let page = await ctx.json<ChatPage>(
      await ctx.app.request('/api/chat/messages', { headers: talker.headers }),
    );
    const seen: string[] = page.messages.map((m) => m.id);
    let pages = 0;

    while (pages < 20) {
      const oldest = seen[0];
      if (oldest === undefined) break;
      page = await ctx.json<ChatPage>(
        await ctx.app.request(`/api/chat/messages?before=${oldest}`, { headers: talker.headers }),
      );
      pages += 1;
      // Every row is older than everything held, so nothing is fetched twice.
      expect(page.messages.every((m) => m.id < oldest)).toBe(true);
      seen.unshift(...page.messages.map((m) => m.id));
      if (!page.hasOlder) break;
    }

    // It ended because history ran out, not because the loop guard fired.
    expect(page.hasOlder).toBe(false);
    expect(pages).toBeLessThan(20);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('reports hasOlder as a fact, not a full-page guess', async () => {
    const talker = await roomOf(120);
    const opening = await ctx.json<ChatPage>(
      await ctx.app.request('/api/chat/messages', { headers: talker.headers }),
    );

    const older = await ctx.json<ChatPage>(
      await ctx.app.request(`/api/chat/messages?before=${opening.messages[0]?.id ?? ''}`, {
        headers: talker.headers,
      }),
    );

    // A full page AND more behind it: the extra row the server reads and drops is what makes this
    // exact rather than "we returned fifty so there is probably more".
    expect(older.messages).toHaveLength(50);
    expect(older.hasOlder).toBe(true);
  });

  it('never reports hasOlder for a forward delta, where the question does not apply', async () => {
    const talker = await roomOf(3);
    const opening = await ctx.json<ChatPage>(
      await ctx.app.request('/api/chat/messages', { headers: talker.headers }),
    );

    const delta = await ctx.json<ChatPage>(
      await ctx.app.request(`/api/chat/messages?after=${opening.messages.at(-1)?.id ?? ''}`, {
        headers: talker.headers,
      }),
    );

    expect(delta.messages).toHaveLength(0);
    expect(delta.hasOlder).toBe(false);
  });

  it('refuses a malformed before cursor, naming that field', async () => {
    const talker = await ctx.signUpParticipant();

    const response = await ctx.app.request('/api/chat/messages?before=not-a-uuid', {
      headers: talker.headers,
    });

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string; field?: string } }>(response);
    expect(body.error.message).toBe(messages.chatCursorInvalid);
    expect(body.error.field).toBe('before');
  });
});

/**
 * ADR-066 — moderation has to reach the phones already looking at the message.
 *
 * Hiding the row and invalidating the cached reads governs only what is fetched next, and a delta
 * read can only ever return *newer* ids — so with no frame of its own a hidden message stays on
 * every open stream's screen for as long as that phone keeps the room open. All three reads have to
 * agree with the frame: live, on reconnect, and on a backwards page.
 */
describe('moderation reaching a room that is already open', () => {
  async function hide(messageId: string, headers: Record<string, string>): Promise<Response> {
    return ctx.app.request(`/api/chat/messages/${messageId}/hide`, jsonRequest({}, headers));
  }

  it('tells an open stream to drop a message a superadmin hides', async () => {
    const listener = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    const stream = await ctx.app.request('/api/chat/stream', { headers: listener.headers });
    const framesPromise = framesUntil(stream, `event: ${CHAT_HIDDEN_EVENT}`);
    // Sent and hidden with nothing awaited in between, so the hide may land on either side of the
    // backlog flush: the buffered path and the live path both have to carry it.
    const { message } = await ctx.json<SendResult>(await send(talker.headers, 'said then hidden'));
    expect((await hide(message.id, superadmin.headers)).status).toBe(200);

    const hidden = (await framesPromise).find((frame) =>
      frame.includes(`event: ${CHAT_HIDDEN_EVENT}`),
    );
    expect(hidden).toContain(message.id);
    // The retraction must not quote what was said, or the frame that removes a message would be
    // the last thing to deliver its text.
    expect(hidden).not.toContain('said then hidden');
    // And it must carry no `id:` field. That field is the resume cursor the browser echoes back;
    // a hidden id is older than the room's tail, so setting it would rewind every reconnect into
    // a full replay.
    expect(hidden).not.toMatch(/(^|\n)id: /);
  });

  it('does not replay a message that was hidden before the phone connected', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const { message } = await ctx.json<SendResult>(
      await send(participant.headers, 'hidden before you looked'),
    );
    await hide(message.id, superadmin.headers);
    await send(participant.headers, 'still here');

    const stream = await ctx.app.request('/api/chat/stream', { headers: participant.headers });

    const text = await readUntil(stream, 'still here');
    expect(text).not.toContain('hidden before you looked');
  });

  it('keeps a hidden message out of a backwards page too', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const { message } = await ctx.json<SendResult>(
      await send(participant.headers, 'regrettable, and in history'),
    );
    const { message: newer } = await ctx.json<SendResult>(await send(participant.headers, 'after'));
    await hide(message.id, superadmin.headers);

    // ADR-065's older-page read is cached under its own key; the hide invalidates CHAT_TAG, which
    // is what makes the two paths agree rather than the page serving a stale window.
    const page = await ctx.json<ChatPage>(
      await ctx.app.request(`/api/chat/messages?before=${newer.id}`, {
        headers: participant.headers,
      }),
    );

    expect(page.messages.map((entry) => entry.id)).not.toContain(message.id);
  });
});

/**
 * ADR-046 §8 mutation C4 — the room gives its subscription back when the socket goes.
 *
 * The status stream's `onAbort` unsubscribe is pinned; this one was not, which is the same
 * one-half-of-a-pair shape the SSE audit kept turning up. A leaked listener is the stream bug
 * with no symptom: nobody sees a wrong frame, the subscription simply stays on the emitter and
 * every later publish walks a longer list of dead writers. It accumulates fastest during the
 * incident that causes it — a phone flapping on bad Wi-Fi all afternoon — and the first
 * evidence anyone gets is memory.
 *
 * Pins the OUTCOME rather than the mechanism, deliberately. There are two unsubscribes on this
 * path — `onAbort` and the `finally` — and removing either alone changes nothing, because
 * cancelling the body aborts the heartbeat's sleep and the `finally` runs immediately anyway.
 * That redundancy is worth keeping and not worth asserting twice over; what must never be true
 * is that a closed socket leaves a listener behind, and removing both does fail this test.
 */
describe('ADR-046 — the room lets go of a closed socket', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });
  afterEach(() => {
    resetChatBusForTests();
  });

  it('unsubscribes when the reader disconnects', async () => {
    const reader = await ctx.signUpParticipant();
    expect(chatSubscriberCountForTests()).toBe(0);

    const stream = await ctx.app.request('/api/chat/stream', { headers: reader.headers });
    expect(stream.status).toBe(200);

    /*
     * Waits for the subscription to appear before taking it away. Asserting only that the
     * count is zero at the end would pass against a handler that never subscribed, which is
     * no kind of proof that it unsubscribed.
     */
    for (let attempt = 0; attempt < 200 && chatSubscriberCountForTests() === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(chatSubscriberCountForTests()).toBe(1);

    await stream.body?.cancel();

    for (let attempt = 0; attempt < 200 && chatSubscriberCountForTests() > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(chatSubscriberCountForTests()).toBe(0);
  });
});
