import { streamSSE } from 'hono/streaming';
import type { SSEStreamingApi } from 'hono/streaming';
import { CHAT_HIDDEN_EVENT, TEAM_CHAT_TYPING_EVENT } from '@psd/contracts';
import type { TeamChatMessageView, TeamChatTypingView } from '@psd/contracts';
import { findActiveMembership, readTeamChatMessages } from '../db/entities/index.js';
import { subscribeToTeamChat, type TeamChatFrame } from '../lib/chatBus.js';
import { runDetached } from '../lib/detached.js';
import { reserveStream } from '../lib/streamLimits.js';
import { describeUnhandledError } from '../lib/errorReport.js';
import { reconnectDelayMs } from '../lib/reconnect.js';
import type { AppContext } from '../lib/session.js';
import { teamChatMessageView } from '../views/teamChat.js';
import type { RoomMember } from './membership.js';

/**
 * ADR-063 — one open stream per phone for its own team's room.
 *
 * Heartbeat for the same reason as the global room (ADR-046): behind the Cloudflare tunnel an idle
 * proxied connection is dropped near a hundred seconds, so a quiet room would silently lose every
 * listener, and the comment frame also reveals sockets beach Wi-Fi has killed without closing.
 */
const HEARTBEAT_MS = 25_000;

/**
 * A message arriving while the backlog is still being written must be neither lost nor sent twice.
 * Subscribing BEFORE the replay read closes the gap: anything the bus delivers early lands here and
 * is flushed afterwards with already-sent ids filtered out. UUIDv7 ids compare chronologically, so
 * "already sent" is a string comparison.
 */
interface Pending {
  buffered: TeamChatMessageView[];
  live: boolean;
}

function resumeCursor(c: AppContext): string | null {
  return c.req.header('last-event-id') ?? c.req.query('after') ?? null;
}

/**
 * ADR-146 — a typing frame, which is everything a message frame is careful about, inverted.
 *
 * **No `id`.** The browser echoes the last id it saw as `Last-Event-ID` on reconnect, and the
 * backlog query resumes from it. An id here would be a cursor pointing at a row that does not
 * exist, and the room would silently lose every message after it.
 *
 * **No membership re-read.** `send` asks the database before every message because a stream
 * outlives the membership that authorised it; paying that per keystroke-window per listener
 * is a query storm for a cosmetic signal. This writes on the answer the stream already has,
 * so for at most one message's worth of time somebody just removed from a team could see a
 * team-mate's nickname — one already on every message in the backlog they were legitimately
 * sent.
 *
 * **Never buffered.** A typing signal that waited for the backlog to finish would arrive
 * describing a sentence that has since been sent. Stale, it is simply dropped.
 */
/**
 * The keep-alive loop, which is also the only thing holding the handler open: `streamSSE`
 * closes the response when its callback returns, so "stay connected" has to be expressed as
 * work that does not finish. `isOpen` is a closure rather than a boolean because it is read
 * after every sleep, and the answer changes when the socket aborts.
 */
async function heartbeatUntilClosed(stream: SSEStreamingApi, isOpen: () => boolean): Promise<void> {
  while (isOpen()) {
    await stream.sleep(HEARTBEAT_MS);
    if (!isOpen()) break;
    await stream.writeSSE({ event: 'heartbeat', data: '' });
  }
}

function writeTyping(stream: SSEStreamingApi, typing: TeamChatTypingView): Promise<void> {
  return stream.writeSSE({ event: TEAM_CHAT_TYPING_EVENT, data: JSON.stringify(typing) });
}

/**
 * ADR-155 — a retraction carries an id in its BODY and no `id:` on the frame.
 *
 * The browser echoes the last id it saw as `Last-Event-ID` and the backlog resumes from it.
 * Tagging a retraction with the id of the message it retracts would wind that cursor back to
 * a row that no longer reads, and the room would silently lose everything after it.
 */
function writeHidden(stream: SSEStreamingApi, messageId: string): Promise<void> {
  return stream.writeSSE({ event: CHAT_HIDDEN_EVENT, data: JSON.stringify({ messageId }) });
}

/**
 * What this socket does with each frame the room publishes — the one place that knows the
 * three kinds differ in how they treat the backlog.
 *
 * A **message** that arrives before the replay finishes is buffered and flushed after it, so
 * nothing is lost and nothing is sent twice. A **typing** signal is dropped instead: held
 * back, it would arrive describing a sentence that has since been sent. A **hidden** frame is
 * dropped for a stronger reason — the backlog is read through `readableBy`, which already
 * excludes hidden rows, so a retraction that waited for the replay would be retracting
 * something this socket was never sent.
 */
function roomListener(socket: {
  stream: SSEStreamingApi;
  pending: Pending;
  send: (message: TeamChatMessageView) => Promise<void>;
  isOpen: () => boolean;
  /** ADR-324 — what this one socket does when a detached write fails: close, so the client reconnects from its cursor. */
  onFailure: (error: unknown) => void;
}): (frame: TeamChatFrame) => void {
  const { stream, pending, send, isOpen, onFailure } = socket;
  return (frame) => {
    if (frame.kind === 'typing') {
      if (isOpen() && pending.live) runDetached(writeTyping(stream, frame.typing), onFailure);
      return;
    }
    if (frame.kind === 'hidden') {
      if (isOpen() && pending.live) runDetached(writeHidden(stream, frame.messageId), onFailure);
      return;
    }
    if (pending.live) {
      runDetached(send(frame.message), onFailure);
      return;
    }
    pending.buffered.push(frame.message);
  };
}

/** ADR-324 — a frame that could not be written: said once, with the values scrubbed out of it. */
function logFrameFailure(error: unknown): void {
  console.error('[api] team chat frame failed; closing this socket', describeUnhandledError(error));
}

export function teamChatStreamResponse(c: AppContext, member: RoomMember): Response {
  const db = c.get('db');
  const cursor = resumeCursor(c);
  const { membership, participant } = member;

  const release = reserveStream(c);
  return streamSSE(c, async (stream) => {
    const pending: Pending = { buffered: [], live: false };
    let lastSentId = cursor ?? '';
    let open = true;

    /**
     * Membership is re-read before every write, not captured when the stream opened. A stream can
     * outlive the membership that authorised it — someone leaves, is moved, or their team disbands
     * — and without this the socket would keep delivering a room they are no longer in. The bus
     * topic already narrows delivery to one team, so this is a handful of listeners per message
     * rather than three hundred, which is what makes checking every time affordable.
     */
    const stillAMember = async (): Promise<boolean> => {
      const current = await findActiveMembership(db, participant.id);
      return current !== null && current.teamId === membership.teamId;
    };

    const send = async (message: TeamChatMessageView): Promise<void> => {
      if (message.id <= lastSentId) return;
      if (!(await stillAMember())) {
        open = false;
        return;
      }
      lastSentId = message.id;
      await stream.writeSSE({ id: message.id, event: 'message', data: JSON.stringify(message) });
    };

    const onFailure = (error: unknown): void => {
      open = false;
      logFrameFailure(error);
    };
    const listener = roomListener({ stream, pending, send, isOpen: () => open, onFailure });
    const unsubscribe = subscribeToTeamChat(membership.teamId, listener);

    stream.onAbort(() => {
      open = false;
      unsubscribe();
    });

    try {
      // ADR-122 — this room's own reconnect delay, ahead of the backlog. See the note in the
      // global room's stream for why it rides a heartbeat.
      await stream.writeSSE({ event: 'heartbeat', data: '', retry: reconnectDelayMs() });
      const backlog = await readTeamChatMessages(db, membership, cursor);
      for (const row of backlog) await send(teamChatMessageView(row));
      for (const message of pending.buffered) await send(message);
      pending.live = true;
      pending.buffered = [];

      await heartbeatUntilClosed(stream, () => open);
    } finally {
      unsubscribe();
      release();
    }
  });
}
