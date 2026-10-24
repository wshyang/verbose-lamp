import type { AlertsView, TeamUpSoonView } from '@psd/contracts';
import type { Executor } from '../db/client.js';
import type { TeamMembershipRow } from '../db/schema/index.js';
import {
  latestChatActivity,
  latestGalleryActivity,
  latestTeamChatActivity,
  readLiveAnnouncements,
} from '../db/entities/index.js';
import { isoOrNull } from './http.js';
import { announcementView } from '../views/announcements.js';
import { readDay, upSoonOf } from '../routes-tournament/support.js';

/**
 * ADR-063/121 — what needs this participant's attention, in one place.
 *
 * Extracted from the route when the status stream arrived, because the stream's opening frame
 * and the fallback poll must answer the identical question. Two copies of this would drift the
 * first time one of them learned about a new kind of alert, and the symptom would be a dot that
 * appears when you poll and vanishes when you reconnect.
 *
 * ADR-125 — every read here is now cached AND shared. The two unread probes this used to make
 * were the last per-reader queries on the path: their cache keys carried the reader's own read
 * marker, so a wave of three hundred reconnects asked them once per distinct marker position.
 * The watermarks that replaced them are facts about the feed rather than about the reader, so
 * the same wave collapses onto three entries — plus one per team for the room watermark, which
 * every member of that team shares.
 *
 * A participant with no team has nothing team-shaped to be alerted about, and that is not an
 * error — being teamless is a legitimate way to attend.
 *
 * ADR-125 — the participant itself is no longer a parameter, and its absence is the headline:
 * nothing on this path is keyed by who is asking any more, which is exactly why the answer can
 * be shared. Only the membership remains, and only to name the team whose room watermark to
 * take.
 *
 * The membership is a parameter rather than a read, because the stream has already had to look
 * it up to know which team topic to subscribe to. Reading it again here cost every reconnect a
 * second indexed query for an answer the caller was holding — invisible at one connection and
 * three hundred of them in the wave after a restart (`docs/design/restart-behaviour.md` §4).
 */
const NOT_UP_SOON: TeamUpSoonView = { upSoon: false, gamesAway: null, fixtureId: null };

/** ADR-280 — the rebuilt tournament's answer, off the cached day every reader shares. */
async function teamUpSoonOf(db: Executor, membership: TeamMembershipRow | null): Promise<TeamUpSoonView> {
  if (membership === null) return NOT_UP_SOON;
  const day = await readDay(db);
  if (day === null || day.row.status !== 'live') return NOT_UP_SOON;
  return upSoonOf(day, membership.teamId);
}

export async function readAlertsFor(
  db: Executor,
  membership: TeamMembershipRow | null,
): Promise<AlertsView> {
  const teamUpSoon = await teamUpSoonOf(db, membership);
  const teamChat = membership === null ? null : await latestTeamChatActivity(db, membership.teamId);
  const live = await readLiveAnnouncements(db);
  return {
    teamUpSoon,
    feeds: {
      chat: isoOrNull(await latestChatActivity(db)),
      teamChat: isoOrNull(teamChat),
      gallery: isoOrNull(await latestGalleryActivity(db)),
    },
    announcements: live.map(announcementView),
  };
}
