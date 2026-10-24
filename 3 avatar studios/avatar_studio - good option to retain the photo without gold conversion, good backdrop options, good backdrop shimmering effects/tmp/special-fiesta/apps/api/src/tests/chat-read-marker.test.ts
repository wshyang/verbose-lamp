import type { AlertsView, ChatMessageView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

/**
 * The global room's activity watermark (ADR-083/125), against the real app and a real database.
 *
 * This file used to prove a per-reader dot: the server held each participant's read marker and
 * answered "is there anything after yours". ADR-125 moved the marker onto the device, so what
 * the server owes is one fact about the room — when it last changed — and the properties worth
 * pinning here are the ones a reader's LED depends on: it tracks the newest VISIBLE message, it
 * goes DOWN when that message is moderated away, and it is the same answer for everybody, which
 * is the whole reason the per-reader probe could be deleted.
 *
 * The room is global and the database is shared across this file, so the tests read as one
 * story: messages accumulate, and each test says what the room holds by then.
 */

interface SendResult {
  message: ChatMessageView;
}

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

async function send(headers: Record<string, string>, body: string): Promise<ChatMessageView> {
  const response = await ctx.app.request('/api/chat/messages', jsonRequest({ body }, headers));
  expect(response.status).toBe(201);
  return (await ctx.json<SendResult>(response)).message;
}

async function feedsFor(headers: Record<string, string>): Promise<AlertsView['feeds']> {
  const response = await ctx.app.request('/api/me/alerts', { headers });
  expect(response.status).toBe(200);
  return (await ctx.json<AlertsView>(response)).feeds;
}

describe("the global room's watermark", () => {
  it('is null while the room has never said anything, which is what must never light a dot', async () => {
    const reader = await ctx.signUpParticipant();

    expect((await feedsFor(reader.headers)).chat).toBeNull();
  });

  it('is the newest message, and the same answer for every reader', async () => {
    const reader = await ctx.signUpParticipant();
    const other = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();

    const message = await send(talker.headers, 'Court 3 is free!');

    /*
     * ADR-125 — the point of the change, stated as an assertion. Two readers at different
     * positions in the room get the identical string, which is why this read can be one cached
     * entry for three hundred phones instead of one query per distinct read marker.
     */
    const mine = (await feedsFor(reader.headers)).chat;
    expect(mine).toBe(message.createdAt);
    expect((await feedsFor(other.headers)).chat).toBe(mine);
  });

  it('moves forward as the room talks', async () => {
    const reader = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();

    const before = (await feedsFor(reader.headers)).chat;
    const second = await send(talker.headers, 'and another');

    const after = (await feedsFor(reader.headers)).chat;
    expect(after).toBe(second.createdAt);
    expect(String(after) > String(before)).toBe(true);
  });

  /*
   * The direction that matters most. A hidden line must not keep a dot burning for something
   * nobody can open the room and see — so the watermark has to be able to go DOWN, which is why
   * the client replaces it on each snapshot rather than merging by maximum.
   */
  it('goes back down when the newest message is moderated away', async () => {
    const reader = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    const kept = await send(talker.headers, 'still fine');
    const offending = await send(talker.headers, 'about to vanish');
    expect((await feedsFor(reader.headers)).chat).toBe(offending.createdAt);

    const hide = await ctx.app.request(
      `/api/chat/messages/${offending.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(hide.status).toBe(200);

    expect((await feedsFor(reader.headers)).chat).toBe(kept.createdAt);
  });

  /*
   * ADR-125 — the round-trip this removed. The device holds its own mark, so there is nothing
   * for a phone to report and no endpoint to report it to. Asserting the 404 rather than
   * deleting the test quietly: a request this app used to make on every room visit, now gone,
   * is exactly the kind of saving a later refactor could reintroduce by accident.
   */
  it('has no read endpoint left to call: the mark lives on the device', async () => {
    const reader = await ctx.signUpParticipant();

    const response = await ctx.app.request(
      '/api/chat/read',
      jsonRequest({ upTo: '01a0f000-0000-7000-8000-000000000001' }, reader.headers),
    );

    expect(response.status).toBe(404);
  });
});
