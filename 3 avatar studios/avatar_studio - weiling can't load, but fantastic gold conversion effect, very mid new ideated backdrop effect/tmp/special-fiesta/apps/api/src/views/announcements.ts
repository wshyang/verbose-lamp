import type { AnnouncementView } from '@psd/contracts';
import type { AnnouncementRow } from '../db/schema/index.js';
import { iso } from '../lib/http.js';

/**
 * ADR-074 — an announcement as a participant sees it.
 *
 * The author label comes from the row's own snapshot, never joined from the account, so a renamed
 * superadmin does not rewrite what the beach was told an hour ago.
 */
export function announcementView(row: AnnouncementRow): AnnouncementView {
  return {
    id: row.id,
    body: row.body,
    authorLabel: row.authorLabelSnapshot,
    createdAt: iso(row.createdAt),
  };
}
