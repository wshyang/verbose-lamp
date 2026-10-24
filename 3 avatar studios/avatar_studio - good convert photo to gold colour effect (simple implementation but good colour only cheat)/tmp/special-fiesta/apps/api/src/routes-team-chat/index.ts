import { Hono } from 'hono';
import {
  chatCursorSchema,
  messages,
  sendTeamChatMessageRequestSchema,
} from '@psd/contracts';
import {
  createTeamChatMessage,
  hideTeamChatMessage,
  latestTeamChatActivity,
  readOlderTeamChatMessages,
  readTeamChatMessageKind,
  readTeamChatMessages,
} from '../db/entities/index.js';
import { HttpError, badRequest, notFound, readBody, requireParam } from '../lib/http.js';
import {
  publishTeamChatHidden,
  publishTeamChatMessage,
  publishTeamChatTyping,
} from '../lib/chatBus.js';
import { publishTeamChatActivity, publishTeamChatRetracted } from '../lib/statusBus.js';
import { createRateLimiter, type RateLimiter } from '../lib/rateLimit.js';
import type { AppBindings, AppContext } from '../lib/session.js';
import { teamChatMessageView } from '../views/teamChat.js';
import { requireTeamMember } from './membership.js';
import { teamChatStreamResponse } from './stream.js';

/**
 * A team's own room (ADR-063).
 *
 * Every route resolves membership first, and membership is the whole authorization story: there is
 * no team id in any path, so a participant can only ever address the room they are currently in.
 * That is deliberate — an id in the URL would invite exactly the wrong-party bug the repo's
 * negative tests exist to catch, and there is nothing to gain from it while a participant is on at
 * most one team (fds.md R2).
 *
 * The rate limit is shared in spirit with the global room: keyed by session rather than IP, because
 * on one event Wi-Fi every phone shares an IP and an IP bucket would throttle the whole beach.
 */

const SEND_CAPACITY = 3;
const SEND_REFILL_MS = 2_000;

/**
 * ADR-146 — the typing ping's own bucket, above the client's 3 s throttle rather than at it.
 *
 * A well-behaved phone sends one of these every three seconds while somebody is writing, so
 * this only ever catches a client that is broken or forged. It is separate from the send
 * bucket on purpose: a burst of typing must never be able to consume the allowance that
 * actually matters, which is the right to say something.
 */
const TYPING_CAPACITY = 4;
const TYPING_REFILL_MS = 2_000;

/** An absent cursor is the room's tail, not an error; a malformed one is a caller's mistake. */
function readCursor(raw: string | undefined, field: 'after' | 'before'): string | null {
  if (raw === undefined || raw === '') return null;
  const parsed = chatCursorSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(messages.chatCursorInvalid, field);
  return parsed.data;
}

export function teamChatRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  const sendLimiter = createRateLimiter({ capacity: SEND_CAPACITY, refillMs: SEND_REFILL_MS });
  const typingLimiter = createRateLimiter({
    capacity: TYPING_CAPACITY,
    refillMs: TYPING_REFILL_MS,
  });

  /**
   * ADR-075 — three reads through one route, told apart by which cursor is present, exactly as the
   * global room does (ADR-065).
   *
   * `after` is the forward delta a reconnect resumes from. `before` walks back up the history and is
   * the only one that reports `hasOlder`. Neither means "open on the tail", which is the default and
   * now fifty messages rather than two hundred. Membership is resolved first in every branch, so a
   * `before` cursor cannot reach a room the caller is not in — and `readableBy`'s join floor still
   * applies, so it cannot reach conversation from before they joined either.
   */
  routes.get('/messages', async (c) => {
    const { membership } = await requireTeamMember(c);
    const before = readCursor(c.req.query('before'), 'before');
    if (before !== null) {
      const page = await readOlderTeamChatMessages(c.get('db'), membership, before);
      return c.json({ messages: page.messages.map(teamChatMessageView), hasOlder: page.hasOlder });
    }
    const cursor = readCursor(c.req.query('after'), 'after');
    const rows = await readTeamChatMessages(c.get('db'), membership, cursor);
    // A delta says nothing about history, and the tail read asks the older page for that.
    return c.json({ messages: rows.map(teamChatMessageView), hasOlder: false });
  });

  routes.get('/stream', async (c) => {
    const member = await requireTeamMember(c);
    return teamChatStreamResponse(c, member);
  });

  routes.post('/messages', async (c) => {
    const { membership, participant, sessionId } = await requireTeamMember(c);
    if (!sendLimiter.take(sessionId)) {
      throw new HttpError(429, messages.chatTooFast);
    }
    const { body } = await readBody(c, sendTeamChatMessageRequestSchema);
    const row = await createTeamChatMessage(c.get('db'), {
      teamId: membership.teamId,
      participantId: participant.id,
      authorLabelSnapshot: participant.nickname,
      titleSnapshot: participant.title,
      body,
    });
    const view = teamChatMessageView(row);
    publishTeamChatMessage(membership.teamId, view);
    // ADR-121/125 — and the dot, for the team-mates who do not have the room open, carrying the
    // row's own time so the frame says exactly what the next snapshot will.
    publishTeamChatActivity(membership.teamId, row.createdAt);
    return c.json({ message: view }, 201);
  });

  registerHide(routes);
  registerTyping(routes, typingLimiter);

  return routes;
}

/**
 * ADR-155 — the captain moderates their own room, and nobody else moderates it at all.
 *
 * The standing privacy ruling is that no superadmin may read team chat, which left the room
 * with a `hidden_at` column, a partial index and no way to write either. The captain is the
 * one person who can both read the room and has standing in it, so giving them the hide needs
 * no change to that ruling — and it is the only option that does not either expose the room or
 * leave a team with no way to deal with what gets said in it.
 *
 * There is no message id in any other route here, and there has to be one in this path. The
 * exposure that creates is closed in the UPDATE itself: the team id is part of the WHERE
 * clause, so an id belonging to another room matches nothing, and the 404 a captain gets for
 * it is the same 404 they get for an id that never existed.
 */
function registerHide(routes: Hono<AppBindings>): void {
  routes.post('/messages/:messageId/hide', async (c) => {
    const { membership } = await requireTeamMember(c);
    if (!membership.isCaptain) throw new HttpError(403, messages.teamChatHideNotCaptain);
    const teamId = membership.teamId;
    const messageId = requireParam(c, 'messageId');

    const row = await hideTeamChatMessage(c.get('db'), { teamId, messageId });
    if (row === null) return refusedHide(c, { teamId, messageId });

    publishTeamChatHidden(teamId, row.id);
    /*
     * ADR-153's pairing, now owed by this room too: the frame above reaches the phones with
     * the room open, and this one reaches the team-mates whose nav dot the hidden line may
     * have been lighting. The read happens after the hide voided the room's tag, so it
     * recomputes rather than returning the entry the hidden line is still newest of.
     */
    publishTeamChatRetracted(teamId, await latestTeamChatActivity(c.get('db'), teamId));
    return c.json({ messageId: row.id });
  });
}

/**
 * Why the hide changed nothing. Three different answers, and conflating them would be the
 * usual moderation bug: a captain pressing hide twice must not be told the message is gone
 * from the room, and a captain trying to erase a roster line must be told why rather than
 * being left to conclude the button is broken.
 */
async function refusedHide(
  c: AppContext,
  target: { teamId: string; messageId: string },
): Promise<Response> {
  const kind = await readTeamChatMessageKind(c.get('db'), target);
  if (kind === null) throw notFound(messages.teamChatMessageNotFound);
  if (kind !== 'said') throw new HttpError(409, messages.teamChatHideNotSaid);
  // Already hidden: the room is in the state the caller asked for, so this is a success that
  // announces nothing. Re-publishing would retract a line twice on every open phone.
  return c.json({ messageId: target.messageId });
}

/**
 * ADR-146 — "I am typing", and the three things it deliberately is not.
   *
 * It is **not a write**: nothing is stored, so the heaviest-frequency route in the room costs
 * one emit and no database work at all. It is **not a 429**: a phone has nothing useful to do
 * with a refusal of a cosmetic signal, and an error for it would be worse than its absence,
 * so a throttled ping is accepted and discarded. And it is **not
 * exempt from the pause**: this route sits under `/api/team-chat/*` behind ADR-118's guard
 * like everything else, so a paused event sheds it with no code here.
 */
function registerTyping(routes: Hono<AppBindings>, typingLimiter: RateLimiter): void {
  routes.post('/typing', async (c) => {
    const { membership, participant, sessionId } = await requireTeamMember(c);
    if (typingLimiter.take(sessionId)) {
      publishTeamChatTyping(membership.teamId, {
        participantId: participant.id,
        label: participant.nickname,
      });
    }
    return c.body(null, 204);
  });
}
