import type { ChatMessageView } from '@psd/contracts';
import type { ChatMessageRow } from '../db/schema/index.js';
import { iso } from '../lib/http.js';

/**
 * ADR-046 — a stored message as the room sees it.
 *
 * Every display value here is read from the row's own snapshot columns, never joined from the
 * author's account. That is what makes the view a record of what was said rather than a
 * rendering of who the author happens to be now.
 *
 * `authorParticipantId` goes out as a bare id on purpose: the web app resolves avatars through
 * its fetch-once sprite cache, so a busy room does not carry the same sprite body hundreds of
 * times over beach Wi-Fi.
 */
export function chatMessageView(row: ChatMessageRow): ChatMessageView {
  return {
    id: row.id,
    authorType: row.authorType,
    authorLabel: row.authorLabelSnapshot,
    authorParticipantId: row.participantId,
    clusterCode: row.clusterCodeSnapshot,
    body: row.body,
    createdAt: iso(row.createdAt),
  };
}
