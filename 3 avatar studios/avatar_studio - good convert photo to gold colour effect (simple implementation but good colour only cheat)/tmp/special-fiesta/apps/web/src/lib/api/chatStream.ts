import { CHAT_HEARTBEAT_EVENT, CHAT_HIDDEN_EVENT } from '@psd/contracts';
import type { ChatHiddenView, ChatMessageView } from '@psd/contracts';
import { readSessionCredential } from '../session/tokenStore.js';
import { createStreamWatchdog } from './streamWatchdog.js';

/**
 * The chat room's live connection (ADR-046).
 *
 * This cannot go through `client.ts`: every helper there ends in `response.json()`, and a
 * stream has no single JSON body to decode.
 *
 * `EventSource` also cannot set request headers — normally the hard part of authenticating a
 * stream. It is already solved here: ADR-016 made the session token acceptable from the query
 * string as a third carrier, so the stream uses that carrier unconditionally rather than
 * following whichever one the client settled on for ordinary requests. The cookie still rides
 * along when the browser keeps one, and `withCredentials` is what lets it.
 */

const STREAM_PATH = '/api/chat/stream';

export interface ChatStreamHandlers {
  onMessage: (message: ChatMessageView) => void;
  onError: () => void;
  /**
   * ADR-064 — fired on connect and on every successful reconnect.
   *
   * Without it `isLive` could only ever go false: `EventSource` raises `error` on any transient
   * drop and then reconnects by itself, so a healthy stream spent the rest of the mount claiming to
   * be offline while a redundant poll ran alongside it.
   */
  onLive: () => void;
  /**
   * ADR-066 — a message has been moderated and must leave the list.
   *
   * Its own event type, so it cannot be mistaken for something said: the frame carries an id and no
   * body, and a retraction that arrived as a `message` would need the room to tell the two apart by
   * shape.
   */
  onHidden: (messageId: string) => void;
  /**
   * ADR-119 — nothing has arrived for longer than the heartbeat allows, so this socket is dead
   * whatever `EventSource` believes. Reported separately from `onError` because the room's
   * response differs: an error may be a transient drop the browser will retry by itself, while
   * a stale socket is one the browser is perfectly happy with and will never retry.
   */
  onStale: () => void;
}

export interface ChatStreamHandle {
  close: () => void;
}

/** Exported for the hook's tests, which assert the token travels in the query string. */
export function chatStreamUrl(cursor: string | null): string {
  const params = new URLSearchParams();
  const credential = readSessionCredential();
  if (credential) params.set('session_token', credential.token);
  if (cursor) params.set('after', cursor);
  const query = params.toString();
  return query ? `${STREAM_PATH}?${query}` : STREAM_PATH;
}

/**
 * Returns `null` when the browser has no `EventSource` at all, which is the caller's signal to
 * fall back to polling the delta endpoint rather than to show an error.
 */
export function openChatStream(
  cursor: string | null,
  handlers: ChatStreamHandlers,
): ChatStreamHandle | null {
  const Source = globalThis.EventSource;
  if (typeof Source !== 'function') return null;

  const source = new Source(chatStreamUrl(cursor), { withCredentials: true });
  const watchdog = createStreamWatchdog(handlers.onStale);

  source.addEventListener('message', (event) => {
    watchdog.touch();
    const frame = event as MessageEvent<string>;
    // A malformed frame must not take the room down; skipping one is survivable, throwing
    // inside an event listener is not.
    try {
      handlers.onMessage(JSON.parse(frame.data) as ChatMessageView);
    } catch {
      handlers.onError();
    }
  });

  source.addEventListener(CHAT_HIDDEN_EVENT, (event) => {
    watchdog.touch();
    const frame = event as MessageEvent<string>;
    try {
      handlers.onHidden((JSON.parse(frame.data) as ChatHiddenView).messageId);
    } catch {
      handlers.onError();
    }
  });

  // Carries no data: its only job is to prove the socket is still carrying frames.
  source.addEventListener(CHAT_HEARTBEAT_EVENT, () => watchdog.touch());

  // `EventSource` reconnects on its own and re-sends Last-Event-ID; the handler exists so the
  // surface can say it is offline, not to re-open the socket by hand.
  source.addEventListener('open', () => {
    watchdog.touch();
    handlers.onLive();
  });

  source.addEventListener('error', () => {
    handlers.onError();
  });

  return {
    close: () => {
      watchdog.stop();
      source.close();
    },
  };
}
