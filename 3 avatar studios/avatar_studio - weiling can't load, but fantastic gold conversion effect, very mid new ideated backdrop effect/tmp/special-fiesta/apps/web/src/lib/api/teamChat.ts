import type { AlertsView, TeamChatMessageView, TeamChatPageView } from '@psd/contracts';
import { apiGet, apiPost, apiPostNoContent } from './client.js';

/**
 * The team room's ordinary requests (ADR-063).
 *
 * No team id anywhere: the server resolves the caller's current membership, so a phone cannot
 * address a room it is not in even by accident. `fetchTeamChatPage` does double duty exactly as the
 * global room's does — the catch-up read after a reconnect, and the whole transport where there is
 * no `EventSource` — so the fallback path cannot drift from the primary one.
 */

export function fetchTeamChatPage(cursor: string | null): Promise<TeamChatPageView> {
  const query = cursor ? `?after=${encodeURIComponent(cursor)}` : '';
  return apiGet(`/api/team-chat/messages${query}`);
}

/** ADR-087 — the page of messages older than `before`, for scrolling back up the room. */
export function fetchOlderTeamChatPage(before: string): Promise<TeamChatPageView> {
  return apiGet(`/api/team-chat/messages?before=${encodeURIComponent(before)}`);
}

export function sendTeamChatMessage(body: string): Promise<{ message: TeamChatMessageView }> {
  return apiPost('/api/team-chat/messages', { body });
}

/**
 * ADR-155 — the captain's hide. The id is the only thing that travels and the only thing that
 * comes back: the server answers with what is gone, not with what it said.
 */
export function hideTeamChatMessage(messageId: string): Promise<{ messageId: string }> {
  return apiPost(`/api/team-chat/messages/${messageId}/hide`, {});
}

/**
 * ADR-146 — "I am typing", thrown over the fence.
 *
 * No body, no response worth reading, and the caller swallows failures: the server answers
 * 204 whether it forwarded the signal or dropped it on the bucket, and a paused event (503)
 * or a dead network is not something a phone should surface for a cosmetic ping.
 */
export function sendTypingPing(): Promise<void> {
  return apiPostNoContent('/api/team-chat/typing');
}

/** What needs attention: the up-soon flag, the feed watermarks and the live announcements. */
export function fetchAlerts(): Promise<AlertsView> {
  return apiGet('/api/me/alerts');
}

