import type { ChatMessageView, ChatPageView } from '@psd/contracts';
import { apiGet, apiPost } from './client.js';

/**
 * The chat room's ordinary requests (ADR-046). The live stream is its own module, because a
 * stream cannot be decoded as one JSON body.
 *
 * `fetchChatPage` is doing double duty by design: it is the catch-up read after a reconnect,
 * and it is the whole transport for a browser with no `EventSource`. Same endpoint, same
 * contract, so the fallback path cannot drift from the primary one.
 */

export function fetchChatPage(cursor: string | null): Promise<ChatPageView> {
  const query = cursor ? `?after=${encodeURIComponent(cursor)}` : '';
  return apiGet(`/api/chat/messages${query}`);
}

/** ADR-065 — the page of messages older than `before`, for scrolling back up. */
export function fetchOlderChatPage(before: string): Promise<ChatPageView> {
  return apiGet(`/api/chat/messages?before=${encodeURIComponent(before)}`);
}

export function sendChatMessage(body: string): Promise<{ message: ChatMessageView }> {
  return apiPost('/api/chat/messages', { body });
}

