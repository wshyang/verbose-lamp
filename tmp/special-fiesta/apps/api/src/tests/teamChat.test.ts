import type { AlertsView } from '@psd/contracts';
import { TEAM_CHAT_TYPING_EVENT, messages } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTeamChatMessage } from '../db/entities/index.js';
import { createTeam, createTestContext, jsonRequest, type TestContext } from './harness.js';

/**
 * ADR-063 — a team's own room.
 *
 * The test that matters most is the wrong-party one: a valid, signed-in participant on a DIFFERENT
 * team must not read or post here. There is also a test that the global room cannot see a team's
 * messages — the property a shared table with a `team_id` column could only have promised, and the
 * whole reason this went in a table of its own.
 */

interface MessageBody {
  message: { id: string; kind: string; body: string | null; authorLabel: string; title: string };
}
interface PageBody {
  messages: { id: string; kind: string; body: string | null; authorLabel: string }[];
  /** ADR-087 — the team room reports history behind the page, as the global room does. */
  hasOlder: boolean;
}
type Actor = { headers: Record<string, string>; nickname: string; title: string };
interface ErrorBody {
  error: { message: string; field?: string };
}

describe('ADR-063 — team chat', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function joinCodeFor(captain: Actor): Promise<string> {
    const response = await ctx.app.request('/api/teams/mine', { headers: captain.headers });
    const body = await ctx.json<{ team: { joinCode: string } }>(response);
    return body.team.joinCode;
  }

  async function join(actor: Actor, captain: Actor) {
    return ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: await joinCodeFor(captain) }, actor.headers),
    );
  }

  async function teamOfTwo() {
    const captain = await ctx.signUpParticipant();
    const mate = await ctx.signUpParticipant();
    /*
     * Named from the TAIL of the nickname, not the head. A nickname is
     * `Marcus_<runId>_<counter>` and the team name is capped at thirty characters, so a
     * prefix-and-truncate loses exactly the counter that makes it unique — which shows up
     * later as a mysterious "name already taken" in whichever test happens to run next.
     */
    const teamId = await createTeam(ctx, captain, `Chatters${captain.nickname.slice(-18)}`);
    expect((await join(mate, captain)).status).toBe(201);
    return { captain, mate, teamId };
  }

  async function send(actor: Actor, body: string) {
    return ctx.app.request('/api/team-chat/messages', jsonRequest({ body }, actor.headers));
  }

  /** Reads whole SSE frames until one matches, then cancels — which aborts the stream. */
  async function framesUntil(response: Response, needle: string, maxFrames = 20): Promise<string[]> {
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
        // Cancelling the reader is how this ends; that is not a failure.
      }
    })();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await reader.cancel();
    await pump;
    return chunks.join('');
  }

  async function page(actor: Actor): Promise<PageBody> {
    const response = await ctx.app.request('/api/team-chat/messages', { headers: actor.headers });
    expect(response.status).toBe(200);
    return ctx.json<PageBody>(response);
  }

  /**
   * ADR-125 — what the server owes the team dot is a watermark, not a boolean. Null means the
   * room is empty (or the reader has no team), which is the one answer that must never light
   * an LED.
   */
  async function watermark(actor: Actor): Promise<string | null> {
    const response = await ctx.app.request('/api/me/alerts', { headers: actor.headers });
    expect(response.status).toBe(200);
    return (await ctx.json<AlertsView>(response)).feeds.teamChat;
  }

  it('lets a member post and read, with label and title frozen on the row', async () => {
    const { captain } = await teamOfTwo();

    const sent = await send(captain, 'Meet at court two');
    expect(sent.status).toBe(201);
    const body = await ctx.json<MessageBody>(sent);
    expect(body.message.kind).toBe('said');
    expect(body.message.body).toBe('Meet at court two');
    expect(body.message.authorLabel).toBe(captain.nickname);
    // ADR-061 — the energetic word, snapshotted as it was when they spoke.
    expect(body.message.title).toBe(captain.title);

    expect((await page(captain)).messages.map((m) => m.body)).toContain('Meet at court two');
  });

  it('refuses a participant on another team — the wrong-party case', async () => {
    const { captain } = await teamOfTwo();
    await send(captain, 'Our plan is a secret');
    const outsider = await ctx.signUpParticipant();
    await createTeam(ctx, outsider, `Rivals${ctx.runId}${outsider.nickname}`.slice(0, 30));

    const theirs = await page(outsider);

    // A valid session, a real team of their own, and none of our conversation in it.
    expect(theirs.messages.every((m) => m.body !== 'Our plan is a secret')).toBe(true);
  });

  it('refuses a participant with no team at all', async () => {
    const teamless = await ctx.signUpParticipant();

    const read = await ctx.app.request('/api/team-chat/messages', { headers: teamless.headers });
    const posted = await send(teamless, 'anyone there');

    expect(read.status).toBe(403);
    expect(posted.status).toBe(403);
    const body = await ctx.json<{ error: { message: string } }>(read);
    expect(body.error.message).toBe(messages.teamChatNotAMember);
  });

  it('keeps team messages out of the global room entirely', async () => {
    const { captain } = await teamOfTwo();
    await send(captain, 'Tactics for the semi-final');

    const global = await ctx.app.request('/api/chat/messages', { headers: captain.headers });
    const body = await ctx.json<PageBody>(global);

    /*
     * The strongest argument for a separate table over a `team_id` column: the global room's route
     * cannot reach these rows at all, so this holds by construction rather than by a WHERE clause
     * somebody has to remember on every future query.
     */
    expect(body.messages.every((m) => m.body !== 'Tactics for the semi-final')).toBe(true);
  });

  it('records joining and leaving, so the room is the team history', async () => {
    const { captain, mate, teamId } = await teamOfTwo();

    const before = await page(captain);
    // Two joins: the captain opening the team, and the mate arriving.
    expect(before.messages.filter((m) => m.kind === 'joined')).toHaveLength(2);
    // A roster event has no body: its sentence is UI copy, not stored text.
    expect(before.messages.filter((m) => m.kind !== 'said').every((m) => m.body === null)).toBe(
      true,
    );

    const left = await ctx.app.request(`/api/teams/${teamId}/leave`, {
      method: 'POST',
      headers: mate.headers,
    });
    expect(left.status).toBe(200);

    const departures = (await page(captain)).messages.filter((m) => m.kind === 'left');
    expect(departures).toHaveLength(1);
    expect(departures[0]?.authorLabel).toBe(mate.nickname);
  });

  it('shows a late joiner the roster history but not the talk before them', async () => {
    const { captain } = await teamOfTwo();
    await send(captain, 'Said before the late one arrived');
    const latecomer = await ctx.signUpParticipant();
    expect((await join(latecomer, captain)).status).toBe(201);

    const theirs = await page(latecomer);

    // The floor applies to conversation only (ADR-063): private talk from before they joined stays
    // private, while roster events stay visible or their history would be empty.
    expect(theirs.messages.every((m) => m.body !== 'Said before the late one arrived')).toBe(true);
    expect(theirs.messages.some((m) => m.kind === 'joined')).toBe(true);
  });

  it('reports when the room last changed, and moves it as the room talks', async () => {
    const { captain, mate } = await teamOfTwo();
    const before = await watermark(captain);

    await send(mate, 'Are we on for four o clock');

    const after = await watermark(captain);
    expect(after).not.toBeNull();
    expect(String(after) > String(before)).toBe(true);
  });

  /*
   * ADR-125 — the saving, stated as an assertion. The watermark is a fact about the ROOM, so
   * two members at different reading positions get the identical string. That is what let the
   * per-member probe — whose cache key was `team:marker:joinedAt`, and so shared almost nothing
   * — collapse to one cached entry per team.
   */
  it('gives every member of a team the same answer, whatever they have read', async () => {
    const { captain, mate } = await teamOfTwo();
    await send(mate, 'Who brought the sunscreen');

    expect(await watermark(captain)).toBe(await watermark(mate));
  });

  it('has nothing to alert a participant with no team about', async () => {
    const teamless = await ctx.signUpParticipant();

    expect(await watermark(teamless)).toBeNull();
  });

  /**
   * ADR-094 — the read is cached per team, so the tag must be too. The failure this catches is
   * one room's traffic answering for another's: A's send voids only A's tag, and B's answer was
   * cached BEFORE it and is re-asked well inside the TTL window.
   */
  it('never serves one team’s cached watermark to another team', async () => {
    const roomA = await teamOfTwo();
    const roomB = await teamOfTwo();
    const quietB = await watermark(roomB.captain);

    await send(roomA.mate, 'Only room A has traffic');

    expect(String(await watermark(roomA.captain)) > String(quietB)).toBe(true);
    expect(await watermark(roomB.captain)).toBe(quietB);
  });

  /*
   * ADR-125 — the round-trip this removed. The mark lives on the device, so there is nothing
   * for a phone to report and no endpoint to report it to.
   */
  it('has no read endpoint left to call: the mark lives on the device', async () => {
    const { captain } = await teamOfTwo();

    const response = await ctx.app.request(
      '/api/team-chat/read',
      jsonRequest({ upTo: '01a0f000-0000-7000-8000-000000000001' }, captain.headers),
    );

    expect(response.status).toBe(404);
  });

  /**
   * ADR-087 — the team room opens on fifty and reaches back on demand, as the global room has since
   * ADR-065. It previously handed out two hundred for both of its reads and had no way back at all.
   */
  describe('paging back through a team room', () => {
    /**
     * Seeded through the repository rather than the route: `POST /messages` is rate limited to three
     * per two seconds, so posting fifty-five lines through it would measure `setTimeout` rather than
     * pagination.
     */
    async function roomOf(count: number) {
      const team = await teamOfTwo();
      for (let at = 0; at < count; at += 1) {
        await createTeamChatMessage(ctx.handle.db, {
          teamId: team.teamId,
          participantId: team.mate.id,
          authorLabelSnapshot: team.mate.nickname,
          titleSnapshot: team.mate.title,
          body: `line ${at}`,
        });
      }
      return team;
    }

    async function olderThan(actor: Actor, before: string): Promise<PageBody> {
      const response = await ctx.app.request(`/api/team-chat/messages?before=${before}`, {
        headers: actor.headers,
      });
      expect(response.status).toBe(200);
      return ctx.json<PageBody>(response);
    }

    it('opens on the newest fifty rather than everything ever said', async () => {
      const { captain } = await roomOf(55);

      const opening = await page(captain);

      expect(opening.messages).toHaveLength(50);
      // The TAIL of the room, oldest-first within the page — not its beginning.
      expect(opening.messages.at(-1)?.body).toBe('line 54');
      // A fresh room is a forward read, which says nothing about history either way.
      expect(opening.hasOlder).toBe(false);
    });

    it('walks back to the start of the room and then stops asking', async () => {
      const { captain } = await roomOf(55);
      let current = await page(captain);
      const seen: string[] = current.messages.map((entry) => entry.id);
      let pages = 0;

      while (pages < 20) {
        const oldest = seen[0];
        if (oldest === undefined) break;
        current = await olderThan(captain, oldest);
        pages += 1;
        // Strictly older than everything held, so nothing is fetched twice.
        expect(current.messages.every((entry) => entry.id < oldest)).toBe(true);
        seen.unshift(...current.messages.map((entry) => entry.id));
        if (!current.hasOlder) break;
      }

      // It ended because history ran out, not because the loop guard fired.
      expect(current.hasOlder).toBe(false);
      expect(pages).toBeLessThan(20);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('reports hasOlder as a fact, not a full-page guess', async () => {
      const { captain } = await roomOf(120);
      const opening = await page(captain);

      const older = await olderThan(captain, opening.messages[0]?.id ?? '');

      // A full page AND more behind it: the extra row the server reads and drops is what makes this
      // exact rather than "fifty came back, so there is probably more".
      expect(older.messages).toHaveLength(50);
      expect(older.hasOlder).toBe(true);
    });

    /**
     * The wrong-party case for the new cursor. Membership is resolved before the cursor is read, so
     * a `before` naming a message in somebody else's room cannot reach it — the walk-back is bounded
     * by the same predicate as every other read here, not by the id it was handed.
     */
    it('will not reach another team’s room through a before cursor', async () => {
      const theirs = await roomOf(3);
      const ours = await roomOf(3);
      const theirRoom = await page(theirs.captain);
      const theirNewest = theirRoom.messages.at(-1)?.id ?? '';

      const page1 = await olderThan(ours.captain, theirNewest);

      const ourBodies = page1.messages.map((entry) => entry.body);
      expect(ourBodies).not.toContain(null);
      // Only our own room's lines, never theirs, even though the cursor came from their room.
      for (const entry of page1.messages) {
        expect(theirRoom.messages.map((mine) => mine.id)).not.toContain(entry.id);
      }
    });

    it('does not show a late joiner talk from before they joined, even walking back', async () => {
      const { captain, mate } = await teamOfTwo();
      await send(mate, 'said before the latecomer arrived');
      const latecomer = await ctx.signUpParticipant();
      expect((await join(latecomer, captain)).status).toBe(201);
      await send(mate, 'said after');

      const opening = await page(latecomer);
      const walked = await olderThan(latecomer, opening.messages[0]?.id ?? '');

      const bodies = [...walked.messages, ...opening.messages].map((entry) => entry.body);
      expect(bodies).not.toContain('said before the latecomer arrived');
    });

    it('refuses a malformed before cursor, naming that field', async () => {
      const { captain } = await teamOfTwo();

      const response = await ctx.app.request('/api/team-chat/messages?before=not-a-uuid', {
        headers: captain.headers,
      });

      expect(response.status).toBe(400);
      const body = await ctx.json<{ error: { message: string; field?: string } }>(response);
      expect(body.error.message).toBe(messages.chatCursorInvalid);
      expect(body.error.field).toBe('before');
    });
  });
  it('pushes a team-mate\'s message to a phone that already has the room open', async () => {
    const { captain, mate } = await teamOfTwo();
    await send(captain, 'before the socket opened');

    const stream = await ctx.app.request('/api/team-chat/stream', { headers: captain.headers });
    expect(stream.status).toBe(200);
    const framesPromise = framesUntil(stream, 'while the socket was open');

    /*
     * The room's whole point: a message reaches an open phone over the bus, with no poll and no
     * second read. The backlog must arrive first, and the pushed message must not be a repeat
     * of it — `lastSentId` is what keeps those two from overlapping.
     */
    await send(mate, 'while the socket was open');

    const frames = await framesPromise;
    const transcript = frames.join('\n');
    expect(transcript).toContain('before the socket opened');
    expect(transcript).toContain('while the socket was open');
    expect(frames.filter((frame) => frame.includes('while the socket was open'))).toHaveLength(1);
  });

  it('stops delivering to a socket whose owner has left the team', async () => {
    const { captain, mate, teamId } = await teamOfTwo();
    await send(captain, 'while the mate was still on the team');

    const stream = await ctx.app.request('/api/team-chat/stream', { headers: mate.headers });
    expect(stream.status).toBe(200);
    const transcript = readFor(stream, 800);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(
      (await ctx.app.request(`/api/teams/${teamId}/leave`, jsonRequest({}, mate.headers))).status,
    ).toBe(200);
    await send(captain, 'after the mate left');

    /*
     * A stream can outlive the membership that authorised it: nothing closes the socket when
     * somebody leaves. So the check happens per delivery rather than at connect — otherwise an
     * ex-member keeps reading the room over a connection that was legitimate when it opened.
     */
    const text = await transcript;
    expect(text).toContain('while the mate was still on the team');
    expect(text).not.toContain('after the mate left');

    // And the front door is shut too, so they cannot simply reconnect.
    const again = await ctx.app.request('/api/team-chat/stream', { headers: mate.headers });
    expect(again.status).toBe(403);
    await again.body?.cancel();
  });

  /**
   * ADR-146 — typing indicators. The signal is cosmetic; the ways it can break the room are not.
   */
  it('reaches a team-mate with the room open, and carries no event id', async () => {
    const { captain, mate } = await teamOfTwo();
    await send(captain, 'before the socket opened');

    const stream = await ctx.app.request('/api/team-chat/stream', { headers: captain.headers });
    expect(stream.status).toBe(200);
    const transcript = readFor(stream, 900);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const ping = await ctx.app.request('/api/team-chat/typing', jsonRequest({}, mate.headers));
    expect(ping.status).toBe(204);

    const text = await transcript;
    expect(text).toContain(`event: ${TEAM_CHAT_TYPING_EVENT}`);
    expect(text).toContain(mate.nickname);

    /*
     * The trap this feature walks straight into. A browser echoes the last id it saw as
     * `Last-Event-ID`, and the backlog read resumes from it — so an id on a typing frame is a
     * cursor pointing at a row that does not exist, and every message after it is lost in
     * silence. The frame must therefore carry no id at all.
     */
    const typingFrame = text
      .split('\n\n')
      .find((frame) => frame.includes(`event: ${TEAM_CHAT_TYPING_EVENT}`));
    expect(typingFrame).toBeDefined();
    expect(typingFrame).not.toContain('id:');
  });

  it('never reaches another team, because it is published to that team\'s topic alone', async () => {
    const { captain } = await teamOfTwo();
    const stranger = await ctx.signUpParticipant();
    await createTeam(ctx, stranger, `Strangers${stranger.nickname.slice(-18)}`);

    const stream = await ctx.app.request('/api/team-chat/stream', { headers: stranger.headers });
    const transcript = readFor(stream, 700);
    await new Promise((resolve) => setTimeout(resolve, 150));

    await ctx.app.request('/api/team-chat/typing', jsonRequest({}, captain.headers));

    // Not a filter the stranger's stream applies — a topic it never subscribed to. Filtering
    // in the client would have been a leak; filtering by re-reading membership per frame
    // would have been a query per listener per keystroke.
    const text = await transcript;
    expect(text).not.toContain(captain.nickname);
  });

  it('is accepted and discarded when it arrives too fast, never refused', async () => {
    const { captain } = await teamOfTwo();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await ctx.app.request(
        '/api/team-chat/typing',
        jsonRequest({}, captain.headers),
      );
      statuses.push(response.status);
    }

    // A phone has nothing useful to do with a refusal of a cosmetic signal, and an error
    // panel for it would be worse than the signal's absence. The bucket still bounds the
    // fan-out; it just does so silently.
    expect(new Set(statuses)).toEqual(new Set([204]));
  });

  it('writes nothing: the room is identical before and after', async () => {
    const { captain, mate } = await teamOfTwo();
    const before = await page(captain);

    await ctx.app.request('/api/team-chat/typing', jsonRequest({}, mate.headers));

    // The one utterance in this app that is thrown away. A typing signal in the history would
    // be a row per keystroke-window per person, describing something already untrue.
    const after = await page(captain);
    expect(after.messages.map((entry) => entry.id)).toEqual(before.messages.map((e) => e.id));
  });

  it('cannot be sent by someone with no team', async () => {
    const loner = await ctx.signUpParticipant();

    const response = await ctx.app.request(
      '/api/team-chat/typing',
      jsonRequest({}, loner.headers),
    );

    // Membership is the whole authorisation story in this file: no team id in any path, so a
    // participant can only ever address the room they are actually in.
    expect(response.status).toBe(403);
  });

  it('ADR-122: hands each phone its own reconnect delay before the backlog', async () => {
    const { captain } = await teamOfTwo();
    await send(captain, 'something to replay');

    const delays: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const stream = await ctx.app.request('/api/team-chat/stream', { headers: captain.headers });
      expect(stream.status).toBe(200);
      const frames = await framesUntil(stream, 'retry:', 4);
      const line = (frames[0] ?? '').split('\n').find((part) => part.startsWith('retry:'));
      delays.push(Number((line ?? '').replace(/^retry:\s*/, '')));
    }

    // Sixty team rooms all reconnecting on the browser's fixed default is the same stampede
    // the shell's stream was fixed for, and the team room's catch-up read is uncached.
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(3_000);
      expect(delay).toBeLessThan(10_000);
    }
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

});

/**
 * ADR-155 — the captain's hide.
 *
 * The room had a `hidden_at` column, a partial index and nothing that ever wrote either, because
 * the one actor with the authority to moderate — a superadmin — is barred from reading the room
 * at all. The captain is the way out of that: the one person who can both see what was said and
 * has standing in the team.
 */
describe('ADR-155 — a captain hides a line in their own room', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  type Actor = { headers: Record<string, string>; nickname: string };

  async function teamOfTwo() {
    const captain = await ctx.signUpParticipant();
    const mate = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Hiders${captain.nickname.slice(-18)}`);
    const code = await ctx.json<{ team: { joinCode: string } }>(
      await ctx.app.request('/api/teams/mine', { headers: captain.headers }),
    );
    expect(
      (
        await ctx.app.request(
          '/api/teams/join',
          jsonRequest({ joinCode: code.team.joinCode }, mate.headers),
        )
      ).status,
    ).toBe(201);
    return { captain, mate, teamId };
  }

  async function say(actor: Actor, body: string): Promise<string> {
    const response = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body }, actor.headers),
    );
    expect(response.status).toBe(201);
    return (await ctx.json<{ message: { id: string } }>(response)).message.id;
  }

  async function hide(actor: Actor, messageId: string): Promise<Response> {
    return ctx.app.request(
      `/api/team-chat/messages/${messageId}/hide`,
      jsonRequest({}, actor.headers),
    );
  }

  /** What was SAID, in order. The joins that formed the team are history, not conversation. */
  async function roomOf(actor: Actor): Promise<string[]> {
    const response = await ctx.app.request('/api/team-chat/messages', { headers: actor.headers });
    const page = await ctx.json<{ messages: { body: string | null; kind: string }[] }>(response);
    return page.messages.filter((m) => m.kind === 'said').map((m) => m.body ?? '');
  }

  it('hides a line for the whole room, not just for the captain who hid it', async () => {
    const { captain, mate } = await teamOfTwo();
    await say(captain, 'Court two at ten');
    const regrettable = await say(mate, 'Something regrettable');

    expect((await hide(captain, regrettable)).status).toBe(200);

    // Both members, because a moderation that only the moderator can see is not moderation.
    expect(await roomOf(captain)).toEqual(['Court two at ten']);
    expect(await roomOf(mate)).toEqual(['Court two at ten']);
  });

  /*
   * The whole authorization story. A member is not a moderator: if they were, anybody could
   * erase the thing they just said the moment it landed badly.
   */
  it('refuses a member who is not the captain', async () => {
    const { captain, mate } = await teamOfTwo();
    const said = await say(captain, 'Captain speaking');

    const response = await hide(mate, said);

    expect(response.status).toBe(403);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.teamChatHideNotCaptain);
    expect(await roomOf(mate)).toEqual(['Captain speaking']);
  });

  /*
   * The wrong-party negative, and the reason the team id is in the UPDATE's WHERE clause rather
   * than in a check beside it. This is the only route in the room that takes an id from the
   * caller, so it is the only one that could be pointed at another team's row.
   */
  it('will not let a captain reach into another team’s room with a borrowed id', async () => {
    const roomA = await teamOfTwo();
    const roomB = await teamOfTwo();
    const theirs = await say(roomA.captain, 'Room A business');

    const response = await hide(roomB.captain, theirs);

    expect(response.status).toBe(404);
    expect(await roomOf(roomA.captain)).toEqual(['Room A business']);
  });

  /*
   * ADR-154 made the room the ONLY record of a staff repair — no audit table, by ruling. A
   * captain who could hide those lines could erase the record of their own team being changed.
   */
  it('refuses to hide a roster line, because that is the team’s record and not conversation', async () => {
    const { captain, mate } = await teamOfTwo();
    const joined = await ctx.json<{ messages: { id: string; kind: string }[] }>(
      await ctx.app.request('/api/team-chat/messages', { headers: captain.headers }),
    );
    const rosterLine = joined.messages.find((message) => message.kind !== 'said');
    expect(rosterLine).toBeDefined();

    const response = await hide(captain, rosterLine?.id ?? '');

    expect(response.status).toBe(409);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.teamChatHideNotSaid);
    expect(mate.nickname).toBeTruthy();
  });

  // Pressing it twice is the same request twice, so it is the same answer twice — and in
  // particular not a 404, which would read as "that message is not in this room".
  it('treats a repeat hide as the state the caller asked for', async () => {
    const { captain } = await teamOfTwo();
    const said = await say(captain, 'Said once');

    expect((await hide(captain, said)).status).toBe(200);
    expect((await hide(captain, said)).status).toBe(200);
    expect(await roomOf(captain)).toEqual([]);
  });

  /*
   * ADR-153's rule reaching the room it missed. A hidden line must not keep a dot burning, so
   * the watermark has to come DOWN — the one movement the client's monotonic merge refuses,
   * which is why the frame that carries it is a retraction rather than an activity.
   */
  it('lowers the room’s watermark when the newest line is the one hidden', async () => {
    const { captain, mate } = await teamOfTwo();
    await say(captain, 'The one before');
    const marked = async (): Promise<string | null> =>
      (await ctx.json<AlertsView>(await ctx.app.request('/api/me/alerts', { headers: mate.headers })))
        .feeds.teamChat;
    const before = await marked();
    const newest = await say(captain, 'The newest line');
    const raised = await marked();
    expect(String(raised) > String(before)).toBe(true);

    expect((await hide(captain, newest)).status).toBe(200);

    expect(await marked()).toBe(before);
  });

  it('reaches a phone with the room already open', async () => {
    const { captain, mate } = await teamOfTwo();
    const doomed = await say(mate, 'On screen already');

    const stream = await ctx.app.request('/api/team-chat/stream', { headers: mate.headers });
    expect(stream.status).toBe(200);
    const transcript = readStream(stream, 900);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect((await hide(captain, doomed)).status).toBe(200);

    const text = await transcript;
    expect(text).toContain('event: hidden');
    expect(text).toContain(doomed);
    /*
     * And NO `id:` on the retraction frame. The browser echoes the last id it saw as
     * Last-Event-ID; tagging this one would wind the cursor back to a row that no longer
     * reads, and the room would lose every message after it on the next reconnect.
     */
    const frame = text.split('\n\n').find((part) => part.includes('event: hidden')) ?? '';
    expect(frame.split('\n').some((line) => line.startsWith('id:'))).toBe(false);
  });
});

/** Reads a stream for a fixed window, then cancels it. */
async function readStream(response: Response, ms: number): Promise<string> {
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
      // Cancelling the reader is how this ends; that is not a failure.
    }
  })();
  await new Promise((resolve) => setTimeout(resolve, ms));
  await reader.cancel();
  await pump;
  return chunks.join('');
}
