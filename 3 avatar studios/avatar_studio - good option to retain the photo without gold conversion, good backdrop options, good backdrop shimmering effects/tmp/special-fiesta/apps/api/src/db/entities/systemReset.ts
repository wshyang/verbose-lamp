import { ne } from 'drizzle-orm';
import type { AppDatabase, AppTransaction } from '../client.js';
import {
  ANNOUNCEMENT_TAG,
  CHAT_TAG,
  GALLERY_TAG,
  LIVE_MATCH_TAG,
  MEMBERSHIP_TAG,
  SCOREBOARD_TAG,
  TOURNAMENT_TAG,
  invalidateTag,
} from '../../lib/cache.js';
import {
  announcements,
  awardBatches,
  chatMessages,
  fringeRounds,
  fringeScans,
  galleryBlobs,
  galleryPhotos,
  galleryReports,
  galleryVotes,
  participants,
  scoreAdjustments,
  sessions,
  swagClaims,
  swagRounds,
  teamAwards,
  teamChatMessages,
  teamMemberships,
  teams,
  tournamentAwardRosters,
  tournamentAwards,
  tournamentEntrants,
  tournamentEvents,
  tournamentGroupEntrants,
  tournamentGroups,
  tournamentMatchRosters,
  tournamentMatches,
  tournamentSchedulerPins,
  tournamentSchedulers,
  tournamentSlots,
  tournamentStages,
  tournaments,
  voidAuditEntries,
} from '../schema/index.js';

/**
 * ADR-307 — the system reset: every row a practice day wrote, deleted in one
 * transaction, in foreign-key order. This is the codebase's one wholesale hard
 * delete, and it is wholesale on purpose: the rows it removes are the event's
 * *activity*, while everything a facilitator configured to run the event —
 * staff accounts, clusters, titles, activities, stations, courts, point config,
 * agenda, screen keys and the operations switches — is setup and survives.
 *
 * Practice scores cannot survive their owners, so the ledgers that hang off
 * participants and teams (scans, claims, adjustments, award batches, the void
 * audit) go with them; a board that kept practice points for people who no
 * longer exist would not be a readied system. The acting superadmin's session
 * is kept so the console stays signed in to report the result; every other
 * session ends, because every other actor's account or team is gone.
 */

export interface SystemResetCounts {
  participants: number;
  teams: number;
  chatMessages: number;
  teamChatMessages: number;
  announcements: number;
  photos: number;
  tournaments: number;
  matches: number;
  fringeRounds: number;
  swagRounds: number;
  sessionsEnded: number;
}

export async function resetEventData(
  db: AppDatabase,
  keepSessionId: string,
): Promise<SystemResetCounts> {
  const counts = await db.transaction(async (tx) => {
    const tournamentCounts = await deleteTournamentTree(tx);
    const scoringCounts = await deleteScoringTree(tx);
    const socialCounts = await deleteSocialTree(tx);
    const peopleCounts = await deletePeopleTree(tx, keepSessionId);
    return { ...tournamentCounts, ...scoringCounts, ...socialCounts, ...peopleCounts };
  });
  // The caches keyed on the deleted rows must not outlive them: a leaderboard
  // memo or a chat catch-up answering for the practice day after the reset
  // would be the reset quietly not having happened.
  for (const tag of [
    SCOREBOARD_TAG,
    CHAT_TAG,
    GALLERY_TAG,
    ANNOUNCEMENT_TAG,
    TOURNAMENT_TAG,
    LIVE_MATCH_TAG,
    MEMBERSHIP_TAG,
  ]) {
    invalidateTag(tag);
  }
  return counts;
}

async function deleteTournamentTree(tx: AppTransaction) {
  await tx.delete(tournamentSchedulerPins);
  await tx.delete(tournamentMatchRosters);
  await tx.delete(tournamentAwardRosters);
  await tx.delete(tournamentSlots);
  await tx.delete(tournamentEvents);
  await tx.delete(tournamentSchedulers);
  await tx.delete(tournamentAwards);
  const matches = await tx.delete(tournamentMatches).returning({ id: tournamentMatches.id });
  await tx.delete(tournamentGroupEntrants);
  await tx.delete(tournamentGroups);
  await tx.delete(tournamentStages);
  await tx.delete(tournamentEntrants);
  const removed = await tx.delete(tournaments).returning({ id: tournaments.id });
  return { tournaments: removed.length, matches: matches.length };
}

async function deleteScoringTree(tx: AppTransaction) {
  await tx.delete(teamAwards);
  await tx.delete(scoreAdjustments);
  await tx.delete(awardBatches);
  await tx.delete(fringeScans);
  const fringe = await tx.delete(fringeRounds).returning({ id: fringeRounds.id });
  await tx.delete(swagClaims);
  const swag = await tx.delete(swagRounds).returning({ id: swagRounds.id });
  await tx.delete(voidAuditEntries);
  return { fringeRounds: fringe.length, swagRounds: swag.length };
}

async function deleteSocialTree(tx: AppTransaction) {
  await tx.delete(galleryVotes);
  await tx.delete(galleryReports);
  await tx.delete(galleryBlobs);
  const photos = await tx.delete(galleryPhotos).returning({ id: galleryPhotos.id });
  const teamChat = await tx.delete(teamChatMessages).returning({ id: teamChatMessages.id });
  const chat = await tx.delete(chatMessages).returning({ id: chatMessages.id });
  const notices = await tx.delete(announcements).returning({ id: announcements.id });
  return {
    photos: photos.length,
    teamChatMessages: teamChat.length,
    chatMessages: chat.length,
    announcements: notices.length,
  };
}

async function deletePeopleTree(tx: AppTransaction, keepSessionId: string) {
  await tx.delete(teamMemberships);
  const removedTeams = await tx.delete(teams).returning({ id: teams.id });
  const ended = await tx
    .delete(sessions)
    .where(ne(sessions.id, keepSessionId))
    .returning({ id: sessions.id });
  const removedPeople = await tx.delete(participants).returning({ id: participants.id });
  return {
    teams: removedTeams.length,
    sessionsEnded: ended.length,
    participants: removedPeople.length,
  };
}
