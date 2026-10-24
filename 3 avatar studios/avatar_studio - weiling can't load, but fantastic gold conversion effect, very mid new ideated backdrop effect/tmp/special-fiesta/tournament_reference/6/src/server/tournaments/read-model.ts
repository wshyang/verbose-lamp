import { asc, eq } from 'drizzle-orm';
import type {
  MatchRecord,
  MatchView,
  PointEntry,
  TeamRecord,
  TournamentRecord,
  TournamentSnapshot,
} from '../../shared/contracts.js';
import { notFound } from '../errors.js';
import { matches, pointEntries, teams, tournaments } from '../db/schema.js';
import type { TournamentDatabase } from '../db/database.js';
import {
  buildStandings,
  createResolutionContext,
  resolveParticipant,
  type LedgerRecord,
} from './standings.js';
import { createScheduleSummary } from './scheduler.js';

export interface TournamentBundle {
  tournament: TournamentRecord;
  teams: TeamRecord[];
  matches: MatchRecord[];
  ledger: LedgerRecord[];
  pointEntries: PointEntry[];
}

export async function readTournamentBundle(
  db: TournamentDatabase,
  tournamentId: string,
): Promise<TournamentBundle> {
  const tournamentRow = await readTournamentRow(db, tournamentId);
  const [teamRows, matchRows, pointRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.tournamentId, tournamentId)).orderBy(asc(teams.seed)),
    db.select().from(matches).where(eq(matches.tournamentId, tournamentId)).orderBy(asc(matches.position)),
    db.select().from(pointEntries).where(eq(pointEntries.tournamentId, tournamentId)),
  ]);
  const teamRecords = teamRows.map(toTeamRecord);
  const matchRecords = matchRows.map(toMatchRecord);
  const ledger = pointRows.map(toLedgerRecord);
  return {
    tournament: toTournamentRecord(tournamentRow),
    teams: teamRecords,
    matches: matchRecords,
    ledger,
    pointEntries: toPointEntries(ledger, teamRecords),
  };
}

export function createTournamentSnapshot(bundle: TournamentBundle): TournamentSnapshot {
  const standings = buildStandings(bundle.teams, bundle.matches, bundle.ledger);
  const context = createResolutionContext(bundle.teams, bundle.matches, bundle.ledger);
  const views = bundle.matches.map((match) => toMatchView(match, context));
  const scheduleSummary = createScheduleSummary(
    bundle.matches,
    bundle.tournament.startTimeMinutes,
    bundle.tournament.tournamentLengthMinutes,
    bundle.tournament.courtCount,
    bundle.tournament.matchDurationMinutes,
  );
  return {
    tournament: bundle.tournament,
    teams: bundle.teams,
    matches: views,
    pointEntries: bundle.pointEntries,
    standings: standings.overall,
    groupStandings: standings.groups,
    scheduleSummary,
  };
}

export function createMatchViews(
  teamRecords: TeamRecord[],
  matchRecords: MatchRecord[],
  ledger: LedgerRecord[],
): MatchView[] {
  const context = createResolutionContext(teamRecords, matchRecords, ledger);
  return matchRecords.map((match) => toMatchView(match, context));
}

function toMatchView(
  match: MatchRecord,
  context: ReturnType<typeof createResolutionContext>,
): MatchView {
  const { homeSlot, awaySlot, ...base } = match;
  return {
    ...base,
    participants: [
      participantView(homeSlot, context),
      participantView(awaySlot, context),
    ],
  };
}

function participantView(
  slot: MatchRecord['homeSlot'],
  context: ReturnType<typeof createResolutionContext>,
) {
  const resolved = resolveParticipant(slot, context);
  return {
    reference: slot,
    displayName: resolved.displayName,
    resolvedTeamId: resolved.teamId,
  };
}

async function readTournamentRow(db: TournamentDatabase, tournamentId: string) {
  const [row] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!row) throw notFound('Tournament not found.');
  return row;
}

export function toTournamentRecord(row: typeof tournaments.$inferSelect): TournamentRecord {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode as TournamentRecord['mode'],
    status: row.status,
    teamCount: row.teamCount,
    courtCount: row.courtCount,
    matchDurationMinutes: row.matchDurationMinutes,
    tournamentLengthMinutes: row.tournamentLengthMinutes,
    startTimeMinutes: row.startTimeMinutes,
    winPoints: row.winPoints,
    drawPoints: row.drawPoints,
    lossPoints: row.lossPoints,
    closingReason: row.closingReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTeamRecord(row: typeof teams.$inferSelect): TeamRecord {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    name: row.name,
    seed: row.seed,
    withdrawnAt: row.withdrawnAt,
    withdrawalReason: row.withdrawalReason,
  };
}

function toMatchRecord(row: typeof matches.$inferSelect): MatchRecord {
  const hasScore = row.homeScore !== null && row.awayScore !== null;
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    code: row.code,
    phase: row.phase,
    roundNumber: row.roundNumber,
    groupKey: row.groupKey,
    position: row.position,
    status: row.status,
    homeSlot: row.homeSlot,
    awaySlot: row.awaySlot,
    dependsOn: row.dependsOn,
    schedule: {
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      courtNumber: row.courtNumber,
      durationMinutes: row.durationMinutes,
    },
    score: hasScore
      ? {
          home: row.homeScore as number,
          away: row.awayScore as number,
          winnerTeamId: row.winnerTeamId,
          finalizedAt: row.finalizedAt,
        }
      : null,
  };
}

function toLedgerRecord(row: typeof pointEntries.$inferSelect): LedgerRecord {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    teamId: row.teamId,
    matchId: row.matchId,
    kind: row.kind,
    points: row.points,
    reason: row.reason,
    voidsEntryId: row.voidsEntryId,
    createdAt: row.createdAt,
  };
}

export function toPointEntries(ledger: LedgerRecord[], teamRecords: TeamRecord[]): PointEntry[] {
  const teamsById = new Map(teamRecords.map((team) => [team.id, team]));
  const voidedEntries = new Set(
    ledger.flatMap((entry) => (entry.voidsEntryId ? [entry.voidsEntryId] : [])),
  );
  return ledger.map((entry) => ({
    ...entry,
    teamName: teamsById.get(entry.teamId)?.name ?? 'Unknown team',
    voided: voidedEntries.has(entry.id),
  }));
}
