import { and, eq, isNull } from 'drizzle-orm';
import type { Match } from '@psd/tournament/core';
import type { AppDatabase, AppTransaction } from '../db/client.js';
import { rosterSnapshot } from '../db/entities/index.js';
import { tournamentAwardRosters, tournamentAwards, tournamentEntrants, tournamentMatchRosters, type RosterSnapshotEntry } from '../db/schema/index.js';
import { firstOrNull, required } from '../db/rows.js';
import { runCommand, type CommandOutcome, type RunInput } from '../tournament/commands.js';
import type { Written } from '../tournament/persist.js';

/**
 * ADR-276 — the points bridge: who on a team a tournament payment reached, frozen when it was made.
 *
 * The core pays entrants and knows no people (ADR-272); the leaderboard pays people. This is the one
 * place the two meet, on the app's side, inside the same transaction as the engine's write:
 *
 * - at kick-off, both teams' rosters are frozen against the match (`tournament_match_roster`) — who
 *   played is who was on the team when it started (ADR-005's rule, moved from completion to kick-off,
 *   because a seat is frozen at kick-off too);
 * - every new award row gets a roster (`tournament_award_roster`): a result award reads its match's
 *   kick-off roster, so a correction that re-pays the match hours later pays the same people; a
 *   manual award, or a result with no kick-off (a walkover, a bye), takes the team as it stands now.
 *
 * A voided award keeps its roster and stops being a score — the leaderboard reads non-voided awards.
 */

/** An entrant's team: a foreign key both ways (`tournament_entrant.team_id`, the slot and award ids). */
async function teamOfEntrant(tx: AppTransaction, entrantId: string): Promise<string> {
  const row = firstOrNull(await tx.select({ teamId: tournamentEntrants.teamId }).from(tournamentEntrants).where(eq(tournamentEntrants.id, entrantId)));
  return required(row, 'tournament entrant').teamId;
}

/** A match that kicked off has both seats frozen — the engine refuses to start one that does not. */
async function freezeMatchRosters(tx: AppTransaction, match: Match): Promise<void> {
  for (const side of ['a', 'b'] as const) {
    const entrantId = required(match.slots[side].seatedEntrantId, 'seat at kick-off');
    const teamId = await teamOfEntrant(tx, entrantId);
    const roster = await rosterSnapshot(tx, teamId);
    // A match handed back to the queue and claimed again kicks off again: the new kick-off's roster
    // is the one its result will pay. Nothing was ever paid against the first.
    await tx
      .insert(tournamentMatchRosters)
      .values({ matchId: match.id, entrantId, teamId, rosterSnapshot: roster })
      .onConflictDoUpdate({ target: [tournamentMatchRosters.matchId, tournamentMatchRosters.entrantId], set: { teamId, rosterSnapshot: roster } });
  }
}

/** The award as the bridge needs it: which entrant, and which match paid it, if any. */
interface Payment {
  id: string;
  entrantId: string;
  matchId: string | null;
}

async function kickOffRoster(tx: AppTransaction, award: Payment): Promise<RosterSnapshotEntry[] | null> {
  if (award.matchId === null) return null;
  const row = firstOrNull(
    await tx
      .select({ roster: tournamentMatchRosters.rosterSnapshot })
      .from(tournamentMatchRosters)
      .where(and(eq(tournamentMatchRosters.matchId, award.matchId), eq(tournamentMatchRosters.entrantId, award.entrantId))),
  );
  return row?.roster ?? null;
}

async function freezeAwardRoster(tx: AppTransaction, award: Payment): Promise<void> {
  const teamId = await teamOfEntrant(tx, award.entrantId);
  const roster = (await kickOffRoster(tx, award)) ?? (await rosterSnapshot(tx, teamId));
  await tx.insert(tournamentAwardRosters).values({ awardId: award.id, teamId, rosterSnapshot: roster }).onConflictDoNothing();
}

/** Rosters for everything the command just started or paid, in the command's own transaction. */
export async function freezeRosters(tx: AppTransaction, written: Written): Promise<void> {
  for (const match of written.startedMatches) await freezeMatchRosters(tx, match);
  for (const award of written.newAwards) await freezeAwardRoster(tx, award);
}

/**
 * The backstop: every payment that has no roster yet gets one now. The scheduler pays too — a Swiss
 * bye pays the win rate — and the scheduler adapter cannot know the app's people (ADR-272), so its
 * payments are frozen here, straight after the re-plan that made them, instead of in its transaction.
 * Idempotent: a payment that already has a roster is untouched.
 */
export async function sweepRosters(db: AppDatabase): Promise<number> {
  return db.transaction(async (tx) => {
    const missing = await tx
      .select({ id: tournamentAwards.id, entrantId: tournamentAwards.entrantId, matchId: tournamentAwards.matchId })
      .from(tournamentAwards)
      .leftJoin(tournamentAwardRosters, eq(tournamentAwardRosters.awardId, tournamentAwards.id))
      .where(isNull(tournamentAwardRosters.awardId));
    for (const award of missing) await freezeAwardRoster(tx, award);
    return missing.length;
  });
}

/** The composition root's `runCommand`: the engine's write and the points bridge, as one transaction. */
export function runBridged(db: AppDatabase, input: Omit<RunInput, 'afterPersist'>): Promise<CommandOutcome> {
  return runCommand(db, { ...input, afterPersist: freezeRosters });
}
