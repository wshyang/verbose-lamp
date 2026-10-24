import { Hono } from 'hono';
import {
  chatCursorSchema,
  messages,
  sendChatMessageRequestSchema,
} from '@psd/contracts';
import {
  createChatMessage,
  invalidateChatMessage,
  latestChatActivity,
  readOlderMessages,
  readVisibleMessages,
} from '../db/entities/index.js';
import { HttpError, badRequest, notFound, readBody, requireParam } from '../lib/http.js';
import { publishChatHidden, publishChatMessage } from '../lib/chatBus.js';
import { publishChatActivity, publishChatRetracted } from '../lib/statusBus.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { requireAnyActor, requireSuperadmin, type AppBindings } from '../lib/session.js';
import { chatMessageView } from '../views/chat.js';
import { authorFrom } from './authorFrom.js';
import { chatStreamResponse } from './stream.js';

/**
 * The chat room (ADR-046) — one global room, promoted from fds.md §9.5 deferred scope.
 *
 * Sending costs one INSERT and no reads: the message reaches every open stream through the
 * in-process bus, not by anyone asking for it. Reads happen only when a phone reconnects, and
 * that read is cached, so a Wi-Fi blip that reconnects three hundred phones at once collapses
 * to about one query.
 *
 * The rate limit is what stops a held-down send key from becoming unbounded INSERTs. It is
 * keyed by session rather than by IP, because on one event Wi-Fi every phone shares an IP and
 * an IP-keyed bucket would throttle the whole beach at once.
 */

const SEND_CAPACITY = 3;
const SEND_REFILL_MS = 2_000;

/** An absent cursor is the room's tail, not an error; a malformed one is a caller's mistake. */
function readCursor(raw: string | undefined, field: 'after' | 'before'): string | null {
  if (raw === undefined || raw === '') return null;
  const parsed = chatCursorSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(messages.chatCursorInvalid, field);
  return parsed.data;
}

export function chatRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  const sendLimiter = createRateLimiter({ capacity: SEND_CAPACITY, refillMs: SEND_REFILL_MS });

  /**
   * ADR-065 — three reads through one route, told apart by which cursor is present.
   *
   * `after` is the forward delta a reconnect resumes from. `before` walks back up the history, and
   * is the only one that reports `hasOlder`. Neither means "open on the tail", which is the default
   * and now fifty messages rather than two hundred.
   */
  routes.get('/messages', async (c) => {
    requireAnyActor(c);
    const before = readCursor(c.req.query('before'), 'before');
    if (before !== null) {
      const page = await readOlderMessages(c.get('db'), before);
      return c.json({ messages: page.messages.map(chatMessageView), hasOlder: page.hasOlder });
    }
    const cursor = readCursor(c.req.query('after'), 'after');
    const rows = await readVisibleMessages(c.get('db'), cursor);
    return c.json({
      messages: rows.map(chatMessageView),
      // A delta says nothing about history, and the tail read asks the older page for that.
      hasOlder: false,
    });
  });

  routes.get('/stream', (c) => {
    requireAnyActor(c);
    return chatStreamResponse(c);
  });

  routes.post('/messages', async (c) => {
    const actor = requireAnyActor(c);
    if (!sendLimiter.take(actor.sessionId)) {
      throw new HttpError(429, messages.chatTooFast);
    }
    const { body } = await readBody(c, sendChatMessageRequestSchema);
    const row = await createChatMessage(c.get('db'), { ...authorFrom(actor), body });
    const view = chatMessageView(row);
    publishChatMessage(view);
    /*
     * ADR-083/121 — the room's own stream carries the message to whoever has the room open;
     * this frame lights the dot for everybody who has not. Two frames rather than one shared
     * frame because the audiences differ by two orders of magnitude: the room is a few readers,
     * the dot is every phone at the event.
     *
     * ADR-125 — it carries the row's own `created_at` and not the message, which is the smallest
     * payload that lets a phone decide for itself. The row's time rather than a fresh one, so the
     * frame and the snapshot can never disagree by a few milliseconds.
     */
    publishChatActivity(row.createdAt);
    return c.json({ message: view }, 201);
  });

  /**
   * Moderation is a superadmin act and a soft hide; the row stays for the audit trail.
   *
   * ADR-066 — hiding the row and invalidating the cached reads only governs what is fetched NEXT,
   * and a delta read can only ever return newer ids, so nothing a phone asks for later can retract
   * what is already on its screen. The frame below is what reaches the phones currently looking at
   * it. Publishing after the row comes back, not before, so a hide that changed nothing (a repeat,
   * or an id that does not exist) tells nobody anything.
   */
  routes.post('/messages/:messageId/hide', async (c) => {
    requireSuperadmin(c);
    const row = await invalidateChatMessage(c.get('db'), requireParam(c, 'messageId'));
    if (!row) throw notFound();
    publishChatHidden(row.id);
    /*
     * ADR-153 — and the dot, for everyone who does NOT have the room open. The hide above
     * reaches the phones looking at the message; this reaches the rest. `invalidateChatMessage`
     * has already voided CHAT_TAG, so this read recomputes rather than returning the stale
     * value the hidden message was still in.
     */
    publishChatRetracted(await latestChatActivity(c.get('db')));
    return c.json({ message: chatMessageView(row) });
  });

  return routes;
}
