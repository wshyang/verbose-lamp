import type { TeamChatMessageView } from '@psd/contracts';
import type { TeamChatMessageRow } from '../db/schema/index.js';
import { iso } from '../lib/http.js';

/**
 * ADR-063 — a stored team message as the room sees it.
 *
 * Every display value comes from the row's own snapshot columns, never joined from the author's
 * account, so the view is a record of what was said rather than a rendering of who the author
 * happens to be now. `authorParticipantId` goes out as a bare id because the web app resolves
 * avatars through its fetch-once sprite cache (ADR-035).
 */
export function teamChatMessageView(row: TeamChatMessageRow): TeamChatMessageView {
  return {
    id: row.id,
    kind: row.kind,
    authorLabel: row.authorLabelSnapshot,
    authorParticipantId: row.participantId,
    title: row.titleSnapshot,
    body: row.body,
    createdAt: iso(row.createdAt),
  };
}
