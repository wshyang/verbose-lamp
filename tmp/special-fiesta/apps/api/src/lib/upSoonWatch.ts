import type { TeamUpSoonView } from '@psd/contracts';
import type { AppDatabase } from '../db/client.js';
import { readDay, upSoonOf, type DayPicture } from '../routes-tournament/support.js';
import { hasStatusSubscribers, publishTeamUpSoon } from './statusBus.js';

/**
 * ADR-121, restored by ADR-282 — who crossed into, or out of, the up-soon window since the last look.
 *
 * **Why a watcher and not a publish at each write site.** Everything moves this window: a match
 * starting, a result, a walkover, a re-plan, a court being switched off in the rain. Watching the
 * answer instead of instrumenting every cause cannot be forgotten by the next feature, and a missed
 * publish here is not a stale number on a screen — it is a team that never gets told to walk over.
 *
 * **Why it costs nothing to look often.** The day picture is one cached read for the whole event
 * (`readDay`), so a tick either hits the memo or pays for the one read every other reader shares.
 *
 * **Why an empty room skips the whole tick.** With no phone connected there is nobody to tell. The
 * remembered picture is kept across the idle stretch: every connection opens with a snapshot that
 * already says where it stands, so a returning phone is told only what actually moved.
 *
 * **Why it publishes transitions and not the picture.** A team hears from this only when its own
 * answer changed — a handful of frames per team per day, not three hundred every few seconds.
 */

/** Paired with the day picture's short memo: faster would read the same memo twice. */
export const UPSOON_WATCH_MS = 5_000;

let previous = new Map<string, TeamUpSoonView>();

/** Every entered team's answer now; an absent or finished day leaves nobody up soon. */
function pictureOf(day: DayPicture | null): Map<string, TeamUpSoonView> {
  const picture = new Map<string, TeamUpSoonView>();
  if (day === null || day.row.status !== 'live') return picture;
  for (const teamId of day.context.teamOf.values()) {
    const answer = upSoonOf(day, teamId);
    if (answer.upSoon) picture.set(teamId, answer);
  }
  return picture;
}

/**
 * Diffs the current picture against the last one and publishes what moved. Returns how many frames
 * it published: "nothing changed, so nobody was told" is as much a requirement as the transitions.
 */
export async function publishUpSoonChanges(db: AppDatabase): Promise<number> {
  if (!hasStatusSubscribers()) return 0;
  const next = pictureOf(await readDay(db));
  let published = 0;
  for (const [teamId, answer] of next) {
    const before = previous.get(teamId);
    // `gamesAway` is part of the comparison: "one game away" becoming "up next" is the transition
    // the team most needs to hear.
    if (before?.fixtureId === answer.fixtureId && before.gamesAway === answer.gamesAway) continue;
    publishTeamUpSoon(teamId, answer);
    published += 1;
  }
  for (const teamId of previous.keys()) {
    if (next.has(teamId)) continue;
    // Leaving the window is a frame too, or the Feed tab's light stays on after the match is played.
    publishTeamUpSoon(teamId, { upSoon: false, gamesAway: null, fixtureId: null });
    published += 1;
  }
  previous = next;
  return published;
}

/** Test seam, and the honest answer for a restart: the first tick re-states the window to everyone in it. */
export function resetUpSoonWatchForTests(): void {
  previous = new Map();
}
