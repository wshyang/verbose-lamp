import { CHAT_HEARTBEAT_EVENT, CHAT_HIDDEN_EVENT, TEAM_CHAT_TYPING_EVENT } from '@psd/contracts';
import type { ChatHiddenView, TeamChatMessageView, TeamChatTypingView } from '@psd/contracts';
import { readSessionCredential } from '../session/tokenStore.js';
import { createStreamWatchdog } from './streamWatchdog.js';

/**
 * The team room's live connection (ADR-063), the same shape as the global room's (ADR-046).
 *
 * It cannot go through `client.ts` — every helper there ends in `response.json()` and a stream has
 * no single body — and `EventSource` cannot set headers, which ADR-016 already solved by accepting
 * the session token from the query string.
 */

const STREAM_PATH = '/api/team-chat/stream';

export interface TeamChatStreamHandlers {
  onMessage: (message: TeamChatMessageView) => void;
  /** ADR-146 — somebody in this room is writing. Carries no id and no backlog. */
  onTyping: (typing: TeamChatTypingView) => void;
  /**
   * ADR-155 — the captain hid a line, and it must leave this room now rather than at the next
   * reload. Its own event type for ADR-066's reason: a retraction that arrived as a `message`
   * would have to be told apart from one by shape, and it carries no body to tell it by.
   */
  onHidden: (messageId: string) => void;
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
   * ADR-119 — no frame has arrived for longer than the heartbeat allows, so this socket is dead
   * however healthy `EventSource` believes it to be. The team room has no polling fallback, so
   * the caller's job here is to reconnect, not merely to relabel itself.
   */
  onStale: () => void;
}

export interface TeamChatStreamHandle {
  close: () => void;
}

/** Exported for the hook's tests, which assert the token travels in the query string. */
export function teamChatStreamUrl(cursor: string | null): string {
  const params = new URLSearchParams();
  const credential = readSessionCredential();
  if (credential) params.set('session_token', credential.token);
  if (cursor) params.set('after', cursor);
  const query = params.toString();
  return query ? `${STREAM_PATH}?${query}` : STREAM_PATH;
}

/**
 * Returns `null` when the browser has no `EventSource`, which is the caller's signal to fall back
 * to polling the delta endpoint rather than to show an error.
 */
export function openTeamChatStream(
  cursor: string | null,
  handlers: TeamChatStreamHandlers,
): TeamChatStreamHandle | null {
  const Source = (globalThis as { EventSource?: typeof EventSource }).EventSource;
  if (Source === undefined) return null;
  const source = new Source(teamChatStreamUrl(cursor), { withCredentials: true });
  const watchdog = createStreamWatchdog(handlers.onStale);

  source.addEventListener('message', (event) => {
    watchdog.touch();
    try {
      handlers.onMessage(JSON.parse((event as MessageEvent<string>).data) as TeamChatMessageView);
    } catch {
      // A frame we cannot parse is not worth tearing the room down for.
    }
  });
  source.addEventListener(TEAM_CHAT_TYPING_EVENT, (event) => {
    watchdog.touch();
    try {
      handlers.onTyping(JSON.parse((event as MessageEvent<string>).data) as TeamChatTypingView);
    } catch {
      // As with a message: a frame we cannot parse is not worth tearing the room down for.
    }
  });
  source.addEventListener(CHAT_HIDDEN_EVENT, (event) => {
    watchdog.touch();
    try {
      const frame = JSON.parse((event as MessageEvent<string>).data) as ChatHiddenView;
      handlers.onHidden(frame.messageId);
    } catch {
      // As with a message: a frame we cannot parse is not worth tearing the room down for.
    }
  });
  // Carries no data: its only job is to prove the socket is still carrying frames.
  source.addEventListener(CHAT_HEARTBEAT_EVENT, () => watchdog.touch());
  source.addEventListener('open', () => {
    watchdog.touch();
    handlers.onLive();
  });

  source.addEventListener('error', () => handlers.onError());
  return {
    close: () => {
      watchdog.stop();
      source.close();
    },
  };
}
