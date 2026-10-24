import { streamSSE } from 'hono/streaming';
import type { SSEStreamingApi } from 'hono/streaming';
import { CHAT_HIDDEN_EVENT } from '@psd/contracts';
import type { ChatHiddenView, ChatMessageView } from '@psd/contracts';
import { readVisibleMessages } from '../db/entities/index.js';
import { subscribeToChat } from '../lib/chatBus.js';
import { runDetached } from '../lib/detached.js';
import { reserveStream } from '../lib/streamLimits.js';
import { reconnectDelayMs } from '../lib/reconnect.js';
import type { ChatFrame } from '../lib/chatBus.js';
import { chatMessageView } from '../views/chat.js';
import type { AppContext } from '../lib/session.js';

/**
 * ADR-046 — one open stream per phone.
 *
 * The heartbeat is not decoration. Behind the Cloudflare tunnel (ADR-043) an idle proxied
 * connection is dropped at roughly a hundred seconds, so a quiet room would silently lose
 * every listener; the same comment frame also reveals sockets that beach Wi-Fi has already
 * killed but not closed. Twenty-five seconds is comfortably inside every such timeout.
 */
const HEARTBEAT_MS = 25_000;

/**
 * A frame that arrives while the backlog is still being written must not be lost, and must not be
 * sent twice. Subscribing BEFORE the replay read closes the gap: anything the bus delivers early
 * lands in this buffer, and is then flushed with ids already sent filtered out. Because ids are
 * UUIDv7 they compare chronologically, so "already sent" is a string compare.
 *
 * ADR-066 — this buffers *hides* as well as messages, and that is the whole reason it is typed as
 * a frame rather than a message. A hide published in the window between the replay read and going
 * live would otherwise be dropped, leaving a message the replay had just sent visible on that one
 * phone until it next remounted — the exact bug the frame exists to fix, reintroduced for whoever
 * happened to be connecting at the time.
 */
interface Pending {
  buffered: ChatFrame[];
  live: boolean;
}

function resumeCursor(c: AppContext): string | null {
  return c.req.header('last-event-id') ?? c.req.query('after') ?? null;
}

interface RoomWriter {
  message: (view: ChatMessageView) => Promise<void>;
  frame: (frame: ChatFrame) => Promise<void>;
}

/**
 * Writes the two frame kinds and owns the resume cursor.
 *
 * A message frame carries `id:`, which is what the browser echoes back as `Last-Event-ID` when it
 * reconnects. A hidden frame must NOT carry one: the message it retracts is, by definition, older
 * than everything already sent, so putting its id on the frame would wind the resume cursor
 * backwards and turn the next reconnect into a replay of the whole room. For the same reason a
 * hide bypasses the `lastSent` guard instead of being filtered by it — every hide is about
 * something already sent, so the guard would swallow all of them and complain about none.
 */
function roomWriter(stream: SSEStreamingApi, cursor: string | null): RoomWriter {
  let lastSent = cursor ?? '';

  const message = async (view: ChatMessageView): Promise<void> => {
    if (view.id <= lastSent) return;
    lastSent = view.id;
    await stream.writeSSE({ id: view.id, event: 'message', data: JSON.stringify(view) });
  };

  const hidden = async (messageId: string): Promise<void> => {
    const view: ChatHiddenView = { messageId };
    await stream.writeSSE({ event: CHAT_HIDDEN_EVENT, data: JSON.stringify(view) });
  };

  return {
    message,
    frame: (frame) => (frame.kind === 'message' ? message(frame.message) : hidden(frame.messageId)),
  };
}

export function chatStreamResponse(c: AppContext): Response {
  const db = c.get('db');
  const cursor = resumeCursor(c);

  const release = reserveStream(c);
  return streamSSE(c, async (stream) => {
    const pending: Pending = { buffered: [], live: false };
    const writer = roomWriter(stream, cursor);
    let open = true;

    const unsubscribe = subscribeToChat((frame) => {
      if (pending.live) {
        runDetached(writer.frame(frame), () => {
          open = false;
        });
        return;
      }
      pending.buffered.push(frame);
    });

    stream.onAbort(() => {
      open = false;
      unsubscribe();
    });

    try {
      /*
       * ADR-122 — the reconnect delay goes out first, on a heartbeat rather than a frame of its
       * own: the client already treats a heartbeat as "still alive and nothing to do", and an
       * empty room has no first message to hang the field on. Writing it before the backlog
       * means a phone that drops mid-replay still has its own delay rather than the browser's
       * fixed one.
       */
      await stream.writeSSE({ event: 'heartbeat', data: '', retry: reconnectDelayMs() });
      const backlog = await readVisibleMessages(db, cursor);
      for (const row of backlog) await writer.message(chatMessageView(row));
      for (const frame of pending.buffered) await writer.frame(frame);
      pending.live = true;
      pending.buffered = [];

      while (open) {
        await stream.sleep(HEARTBEAT_MS);
        if (!open) break;
        await stream.writeSSE({ event: 'heartbeat', data: '' });
      }
    } finally {
      unsubscribe();
      release();
    }
  });
}
