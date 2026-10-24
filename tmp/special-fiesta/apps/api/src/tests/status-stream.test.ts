import {
  STATUS_ANNOUNCEMENT_EVENT,
  STATUS_ANNOUNCEMENT_RETRACTED_EVENT,
  STATUS_CHAT_ACTIVITY_EVENT,
  STATUS_CHAT_RETRACTED_EVENT,
  STATUS_GALLERY_ACTIVITY_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_TEAM_CHAT_ACTIVITY_EVENT,
  STATUS_TEAM_CHAT_RETRACTED_EVENT,
} from '@psd/contracts';
import type { AlertsView } from '@psd/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  seedTeamsReady,
  type ActorSession,
  type ParticipantSession,
  type TestContext,
} from './harness.js';
import { teamNameFor } from './fixtures/names.js';
import { skipsCompression } from '../app.js';
import { resetStatusBusForTests } from '../lib/statusBus.js';

/**
 * ADR-121 — one socket per phone for everything that is not a chat room.
 *
 * SSE was chosen over WebSockets partly because an SSE route stays exercisable through
 * `app.request()` with no listening socket (ADR-046), so these are real end-to-end reads of
 * real frames rather than assertions about a bus.
 *
 * What has to be true: the first frame always says what is true *now* (because a reconnect is
 * a re-sync, not a replay), a frame published while that first read is in flight is not lost,
 * one team's news never reaches another team's phone, and nothing on this stream can be read
 * by someone who should not have it.
 */

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => ctx.close());
afterEach(() => {
  // A listener outliving its test would receive the next test's frames.
  resetStatusBusForTests();
});

/**
 * Reads frames until one contains `needle`, then cancels — which is also what fires the
 * stream's abort handler, so this doubles as the proof that a closed connection unsubscribes.
 */
async function framesUntil(response: Response, needle: string, maxFrames = 50): Promise<string> {
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
  return seen.join('\n');
}

/**
 * Reads whatever arrives inside a short window, then cancels. The only way to assert that a
 * frame did NOT reach a socket: waiting for one that never comes has no other end.
 */
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
      // Cancelling mid-read is how this ends; it is not a failure.
    }
  })();
  await new Promise((resolve) => setTimeout(resolve, ms));
  await reader.cancel();
  await pump;
  return chunks.join('');
}

/**
 * A stream kept open and read in the background, so a test can wait for one frame, make
 * something happen, and then wait for the next on the same connection.
 *
 * This exists because of a race that `hasStatusSubscribers()` could not close. `app.request()`
 * resolves when the response head is written, which is *before* the handler has subscribed to
 * the bus — and a publish in that gap reaches nobody. Polling the bus for "is anybody
 * subscribed" looks like it fixes that, and does not: under a loaded suite the previous test's
 * handler can still be mid-subscribe, so the poll sees *its* listener, the test publishes, and
 * the frame goes to a stream nobody is reading. The only honest proof that this connection is
 * listening is a frame from this connection — and the snapshot is written after the subscribe,
 * so waiting for it is exactly that proof.
 */
interface StreamWatch {
  waitFor: (needle: string) => Promise<string>;
  transcript: () => string;
  close: () => Promise<void>;
}

function watchStream(response: Response): StreamWatch {
  const body = response.body;
  if (!body) throw new Error('The stream had no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const frames: string[] = [];
  let buffered = '';

  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const parts = buffered.split('\n\n');
        buffered = parts.pop() ?? '';
        frames.push(...parts.filter((part) => part.trim() !== ''));
      }
    } catch {
      // Cancelling is how this ends.
    }
  })();

  return {
    /*
     * Ten seconds, which is where this started.
     *
     * It was raised to thirty as a mitigation for a flake that turned out not to be timing at
     * all (see `captainOf` below): the test was waiting on a frame that was correctly never
     * sent, so a longer budget only bought a slower red build. With the cause fixed the
     * original budget is right — this polls for a frame that has *already* been published, so
     * the only real wait is the event loop reaching the stream's write, and ten seconds is
     * already three orders of magnitude more than that takes.
     *
     * The failure message stays. It earned its place by being the thing that diagnosed this.
     */
    waitFor: async (needle) => {
      for (let attempt = 0; attempt < 1_000; attempt += 1) {
        const found = frames.find((frame) => frame.includes(needle));
        if (found !== undefined) return found;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(
        `No frame containing ${needle} arrived; saw ${frames.length}: ${frames.join(' | ')}`,
      );
    },
    transcript: () => frames.join('\n'),
    close: async () => {
      await reader.cancel();
      await pump;
    },
  };
}

/**
 * The smallest byte sequence that genuinely is a WebP, so the server's sniffer accepts it.
 * Duplicated from `gallery.test.ts` rather than shared: the sniffer's whole job is to reject
 * what merely claims to be an image, and a fixture both suites could edit is a fixture one of
 * them could weaken for the other.
 */
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
]);

let rawCounter = 0;

/** Shares a photo through the real multipart route: the gallery LED has no other trigger. */
async function uploadPhoto(actor: ActorSession, caption: string): Promise<{ createdAt: string }> {
  rawCounter += 1;
  const raw = new Uint8Array(64);
  raw.set(WEBP);
  // The SHA-1 duplicate guard is global, so every upload in this file needs its own bytes.
  raw[60] = rawCounter & 0xff;
  const form = new FormData();
  form.set('full', new Blob([WEBP], { type: 'image/webp' }), 'full.webp');
  form.set('thumb', new Blob([WEBP], { type: 'image/webp' }), 'thumb.webp');
  form.set('raw', new Blob([raw]), 'IMG_0001.HEIC');
  form.set('filename', 'IMG_0001.HEIC');
  form.set('caption', caption);
  form.set('width', '1280');
  form.set('height', '960');
  const response = await ctx.app.request('/api/gallery/photos', {
    method: 'POST',
    headers: actor.headers,
    body: form,
  });
  expect(response.status).toBe(201);
  return (await ctx.json<{ photo: { createdAt: string } }>(response)).photo;
}

async function openStream(actor: ActorSession): Promise<Response> {
  return ctx.app.request('/api/status/stream', { headers: actor.headers });
}

/** Opens a stream and waits until its snapshot proves the handler is subscribed. */
async function openWatched(actor: ActorSession): Promise<StreamWatch> {
  const watch = watchStream(await openStream(actor));
  await watch.waitFor(STATUS_SNAPSHOT_EVENT);
  return watch;
}

function snapshotFrom(text: string): AlertsView {
  const line = text
    .split('\n')
    .find((candidate) => candidate.startsWith('data:') && candidate.includes('announcements'));
  return JSON.parse((line ?? '').replace(/^data:\s*/, '')) as AlertsView;
}

async function announce(superadmin: ActorSession, body: string): Promise<string> {
  const response = await ctx.app.request(
    '/api/admin/announcements',
    jsonRequest({ body }, superadmin.headers),
  );
  const payload = await ctx.json<{ announcement: { id: string } }>(response);
  return payload.announcement.id;
}

describe('ADR-121 — the status stream', () => {
  it('is exempt from gzip, because a buffered stream is a stalled one', () => {
    expect(skipsCompression('/api/status/stream')).toBe(true);
    // The carve-out must stay narrow: ADR-034's measured board result depends on it.
    expect(skipsCompression('/api/me/alerts')).toBe(false);
  });

  it('opens with the whole picture, not with a promise of frames to come', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    await announce(superadmin, 'said before you connected');

    const stream = await openStream(participant);
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');

    const text = await framesUntil(stream, STATUS_SNAPSHOT_EVENT);
    expect(text).toContain(`event: ${STATUS_SNAPSHOT_EVENT}`);
    const snapshot = snapshotFrom(text);
    // The point of the snapshot: a phone that was away learns the current answer without a
    // replay and without a poll, including things said while it was gone.
    expect(snapshot.announcements.map((item) => item.body)).toContain('said before you connected');
    // ADR-125 — and the feed watermarks, so the dots are decided without a second request.
    expect(snapshot.feeds).toEqual({ chat: null, teamChat: null, gallery: null });
  });

  it('spreads reconnects over a window, instead of bringing every phone back together', async () => {
    const participant = await ctx.signUpParticipant();

    const delays: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const stream = await openStream(participant);
      const text = await framesUntil(stream, STATUS_SNAPSHOT_EVENT);
      const line = text.split('\n').find((candidate) => candidate.startsWith('retry:'));
      delays.push(Number((line ?? '').replace(/^retry:\s*/, '')));
    }

    // Every phone is told its own reconnect delay, because `EventSource` otherwise uses a
    // fixed one and a tunnel blip brings three hundred of them back in the same second.
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(3_000);
      expect(delay).toBeLessThan(10_000);
    }
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('pushes an announcement to a phone that is already connected', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    const stream = await openStream(participant);
    const framesPromise = framesUntil(stream, 'pushed while you watched');
    await announce(superadmin, 'pushed while you watched');

    const text = await framesPromise;
    expect(text).toContain(`event: ${STATUS_ANNOUNCEMENT_EVENT}`);
    // The whole announcement rides the frame: nobody is told to go and fetch it.
    expect(text).toContain('pushed while you watched');
  });

  it('retracts by id, because a stream must not re-say what it is unsaying', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const id = await announce(superadmin, 'this one is a mistake');

    const stream = await openStream(participant);
    const framesPromise = framesUntil(stream, STATUS_ANNOUNCEMENT_RETRACTED_EVENT);
    await ctx.app.request(
      `/api/admin/announcements/${id}/retract`,
      jsonRequest({}, superadmin.headers),
    );

    const text = await framesPromise;
    const retraction = text
      .split('\n')
      .filter((line) => line.startsWith('data:') && line.includes('announcementId'))
      .join('');
    expect(retraction).toContain(id);
    expect(retraction).not.toContain('this one is a mistake');
  });

  it('lights the chat dot without putting the message on every phone at the event', async () => {
    const participant = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();

    const stream = await openStream(participant);
    const framesPromise = framesUntil(stream, STATUS_CHAT_ACTIVITY_EVENT);
    await ctx.app.request(
      '/api/chat/messages',
      jsonRequest({ body: 'something in the big room' }, talker.headers),
    );

    const text = await framesPromise;
    expect(text).toContain(`event: ${STATUS_CHAT_ACTIVITY_EVENT}`);
    // Sending the message itself would mean every chat line reaching all three hundred phones
    // whether or not the room is open — the opposite of a saving.
    expect(text).not.toContain('something in the big room');
  });

  /*
   * ADR-153 — hiding a message lowers the room's latest, and the frame has to say so.
   *
   * The two assertions are one bug each. The timestamp must be the SURVIVING message's own
   * time, because the phone assigns it: a fresh `new Date()` here would park every watermark
   * in the future and keep the dot dark for the next real message. And it must be the message
   * that is still visible, not the one just hidden — which is the whole point of reading after
   * the invalidation rather than reusing the row in hand.
   */
  it('lowers the chat watermark to the surviving message when one is hidden', async () => {
    const participant = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    const first = await ctx.json<{ message: { id: string; createdAt: string } }>(
      await ctx.app.request('/api/chat/messages', jsonRequest({ body: 'kept' }, talker.headers)),
    );
    const second = await ctx.json<{ message: { id: string; createdAt: string } }>(
      await ctx.app.request('/api/chat/messages', jsonRequest({ body: 'hidden' }, talker.headers)),
    );

    const watch = await openWatched(participant);
    await ctx.app.request(
      `/api/chat/messages/${second.message.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );

    const frame = await watch.waitFor(STATUS_CHAT_RETRACTED_EVENT);
    expect(frame).toContain(JSON.stringify({ at: first.message.createdAt }));
    expect(frame).not.toContain(second.message.createdAt);
    // The frame and the snapshot must agree, or a reconnect would undo what the frame did.
    const alerts = await ctx.app.request('/api/me/alerts', { headers: participant.headers });
    expect((await ctx.json<AlertsView>(alerts)).feeds.chat).toBe(first.message.createdAt);
    await watch.close();
  });

  /*
   * And the empty room: hiding the only message leaves nothing, which is `null` rather than a
   * missing field. A client that treated absence as "unchanged" would keep the dot lit forever.
   */
  it('reports a null watermark when the hidden message was the only one', async () => {
    const participant = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    await ctx.app.request('/api/chat/messages', jsonRequest({ body: 'alone' }, talker.headers));
    // This suite shares one database, so "the only message" has to be made true rather than
    // assumed: everything earlier tests said is still visible in the same room.
    const { messages: visible } = await ctx.json<{ messages: { id: string }[] }>(
      await ctx.app.request('/api/chat/messages', { headers: participant.headers }),
    );
    for (const row of visible.slice(0, -1)) {
      await ctx.app.request(
        `/api/chat/messages/${row.id}/hide`,
        jsonRequest({}, superadmin.headers),
      );
    }

    const watch = await openWatched(participant);
    const last = visible.at(-1);
    await ctx.app.request(
      `/api/chat/messages/${last?.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );

    expect(await watch.waitFor(STATUS_CHAT_RETRACTED_EVENT)).toContain(
      JSON.stringify({ at: null }),
    );
    await watch.close();
  });

  /*
   * ADR-125 — the frame carries the ROW's own time, not a fresh one taken at publish.
   *
   * This is the assertion the design hangs on. The phone stores whatever the frame says as its
   * read mark; if that string were a few milliseconds ahead of what the database recorded, the
   * next snapshot would report a watermark *below* the mark and the dot would be stuck dark
   * for the message after it. Sabotaged by publishing `new Date()` instead of `row.createdAt`:
   * the equality below fails by a hair, which is exactly the size of the bug.
   */
  it('carries the message’s own timestamp, so the frame and the next snapshot agree', async () => {
    const participant = await ctx.signUpParticipant();
    const talker = await ctx.signUpParticipant();

    const watch = await openWatched(participant);
    const sent = await ctx.app.request(
      '/api/chat/messages',
      jsonRequest({ body: 'what time is it' }, talker.headers),
    );
    const { message } = await ctx.json<{ message: { createdAt: string } }>(sent);

    const frame = await watch.waitFor(STATUS_CHAT_ACTIVITY_EVENT);
    expect(frame).toContain(JSON.stringify({ at: message.createdAt }));

    const alerts = await ctx.app.request('/api/me/alerts', { headers: participant.headers });
    expect((await ctx.json<AlertsView>(alerts)).feeds.chat).toBe(message.createdAt);
    await watch.close();
  });

  /*
   * ADR-125 — the gallery had no LED at all before this, so the frame is the feature. A photo
   * is the one social feed whose arrival is silent otherwise: nobody is sitting on the Photos
   * tab waiting for it.
   */
  it('lights the gallery dot when a photo lands, without shipping the photo', async () => {
    const participant = await ctx.signUpParticipant();
    const uploader = await ctx.signUpParticipant();

    const watch = await openWatched(participant);
    const shared = await uploadPhoto(uploader, 'a caption nobody should receive');

    const frame = await watch.waitFor(STATUS_GALLERY_ACTIVITY_EVENT);
    expect(frame).not.toContain('a caption nobody should receive');

    const alerts = await ctx.app.request('/api/me/alerts', { headers: participant.headers });
    expect((await ctx.json<AlertsView>(alerts)).feeds.gallery).toBe(shared.createdAt);
    await watch.close();
  });

  /**
   * B-3 (audit 2026-10-05) — restoring a hidden photo lights the dot too.
   *
   * The hide path published and the unhide path published, but only the hide was pinned: the
   * push on the restore could be deleted and the whole suite stayed green. A restored photo
   * is new to everyone who never saw it, so without this frame it arrives in silence and the
   * only people who find it are the ones who happened to reopen the gallery afterwards.
   */
  it('lights the gallery dot again when a hidden photo is restored', async () => {
    const participant = await ctx.signUpParticipant();
    const uploader = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();

    await uploadPhoto(uploader, 'briefly hidden');
    const listed = await ctx.app.request('/api/gallery/moderation', {
      headers: superadmin.headers,
    });
    const { photos } = await ctx.json<{ photos: { id: string }[] }>(listed);
    const photoId = photos[0]?.id as string;
    expect(photoId).toBeDefined();

    const hidden = await ctx.app.request(
      `/api/gallery/photos/${photoId}/hide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(hidden.status).toBe(200);

    // The stream opens AFTER the hide, so the only gallery frame it can possibly see is the
    // one the restore publishes.
    const watch = await openWatched(participant);
    const restored = await ctx.app.request(
      `/api/gallery/photos/${photoId}/unhide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(restored.status).toBe(200);

    const frame = await watch.waitFor(STATUS_GALLERY_ACTIVITY_EVENT);
    expect(frame).toContain(`event: ${STATUS_GALLERY_ACTIVITY_EVENT}`);
    expect(frame).not.toContain('briefly hidden');
    await watch.close();
  });

  describe('team frames', () => {
    let teamsFixture: Awaited<ReturnType<typeof seedTeamsReady>>;
    let outsider: ParticipantSession;

    beforeAll(async () => {
      teamsFixture = await seedTeamsReady(ctx);
      outsider = await ctx.signUpParticipant();
      await createTeam(ctx, outsider, teamNameFor(ctx.runId));
    });

    it('reaches the team it is about, and only that team', async () => {
      const mine = await openStream(teamsFixture.captainA);
      const theirs = await openStream(outsider);
      const minePromise = framesUntil(mine, STATUS_TEAM_CHAT_ACTIVITY_EVENT, 6);
      const theirsPromise = readFor(theirs, 150);

      await ctx.app.request(
        '/api/team-chat/messages',
        jsonRequest({ body: 'team talk' }, teamsFixture.captainA.headers),
      );

      expect(await minePromise).toContain(`event: ${STATUS_TEAM_CHAT_ACTIVITY_EVENT}`);
      /*
       * The other team's socket was never written to — a per-team topic means the server
       * never says it, rather than saying it and trusting the client to ignore it. Filtering
       * on the client would have been a data leak.
       */
      const theirsText = await theirsPromise;
      expect(theirsText).toContain(`event: ${STATUS_SNAPSHOT_EVENT}`);
      expect(theirsText).not.toContain(STATUS_TEAM_CHAT_ACTIVITY_EVENT);
    });

    /*
     * ADR-155 — a hide reaches the team-mates who do NOT have the room open. The hidden line
     * may have been the one lighting their dot, and the activity frame cannot say so: the
     * client merges activity monotonically on purpose, so the frame that lowers a watermark
     * has to be a retraction the client assigns.
     */
    it('publishes a team-chat retraction when the captain hides a line', async () => {
      const said = await ctx.app.request(
        '/api/team-chat/messages',
        jsonRequest({ body: 'to be hidden' }, teamsFixture.captainA.headers),
      );
      const { message } = await ctx.json<{ message: { id: string } }>(said);

      const mine = await openStream(teamsFixture.captainA);
      const theirs = await openStream(outsider);
      const minePromise = framesUntil(mine, STATUS_TEAM_CHAT_RETRACTED_EVENT, 6);
      const theirsPromise = readFor(theirs, 150);

      expect(
        (
          await ctx.app.request(
            `/api/team-chat/messages/${message.id}/hide`,
            jsonRequest({}, teamsFixture.captainA.headers),
          )
        ).status,
      ).toBe(200);

      expect(await minePromise).toContain(`event: ${STATUS_TEAM_CHAT_RETRACTED_EVENT}`);
      // Per-team, exactly as the activity frame is: another team's dot is not this team's business.
      expect(await theirsPromise).not.toContain(STATUS_TEAM_CHAT_RETRACTED_EVENT);
    });
  });

  it('refuses a stream to someone signed out', async () => {
    const response = await ctx.app.request('/api/status/stream');
    expect(response.status).toBe(401);
  });

  it('refuses a facilitator: every frame on it is addressed to a participant', async () => {
    const facilitator = await ctx.createFacilitator();
    const response = await openStream(facilitator);
    expect(response.status).toBe(403);
  });
});

