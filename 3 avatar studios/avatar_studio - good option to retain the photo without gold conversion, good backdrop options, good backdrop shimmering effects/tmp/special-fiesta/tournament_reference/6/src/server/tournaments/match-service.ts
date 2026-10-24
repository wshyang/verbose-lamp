import { v7 as uuidv7 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import type {
  FinalizeMatchInput,
  LiveScoreInput,
  MatchRecord,
  StageMatchInput,
  TeamRecord,
  TournamentSnapshot,
} from '../../shared/contracts.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import type { TournamentDatabase } from '../db/database.js';
import { matches, pointEntries, tournaments } from '../db/schema.js';
import { readTournamentBundle } from './read-model.js';
import { createTournamentSnapshot } from './read-model.js';
import { scheduleManualMatch } from './scheduler.js';
import { createResolutionContext, resolveParticipant } from './standings.js';

export class MatchService {
  constructor(
    private readonly db: TournamentDatabase,
    private readonly createId: () => string = uuidv7,
  ) {}

  async stage(tournamentId: string, input: StageMatchInput): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    ensureTournamentOpen(bundle.tournament.status);
    const home = activeTeam(bundle.teams, input.homeTeamId);
    const away = activeTeam(bundle.teams, input.awayTeamId);
    if (home.id === away.id) throw unprocessable('Choose two different teams.');
    const schedule = scheduleManualMatch(
      bundle.matches,
      [home.id, away.id],
      bundle.tournament,
      input.startMinute,
      input.courtNumber,
    );
    const id = this.createId();
    const nextMatch = createManualMatch(id, tournamentId, home, away, bundle.matches, input, schedule);
    await this.db.insert(matches).values(toMatchInsert(nextMatch));
    return readSnapshot(this.db, tournamentId);
  }

  async updateLiveScore(
    tournamentId: string,
    matchId: string,
    input: LiveScoreInput,
  ): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    ensureTournamentOpen(bundle.tournament.status);
    const match = scopedMatch(bundle.matches, matchId);
    ensureScoreCanChange(match.status);
    validateScore(input.home, input.away);
    ensureResolvedTeams(match, bundle);
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(matches)
        .set({ status: 'live', homeScore: input.home, awayScore: input.away })
        .where(and(eq(matches.id, matchId), eq(matches.tournamentId, tournamentId)));
      await transaction
        .update(tournaments)
        .set({ status: 'running', updatedAt: new Date().toISOString() })
        .where(eq(tournaments.id, tournamentId));
    });
    return readSnapshot(this.db, tournamentId);
  }

  async finalize(
    tournamentId: string,
    matchId: string,
    input: FinalizeMatchInput,
  ): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    ensureTournamentOpen(bundle.tournament.status);
    const match = scopedMatch(bundle.matches, matchId);
    if (match.status !== 'live') throw conflict('Start the match and record a live score before finalising it.');
    validateScore(input.home, input.away);
    const participantIds = ensureResolvedTeams(match, bundle);
    const winnerTeamId = decideWinner(input, participantIds, bundle.matches, match);
    const finalizedAt = new Date().toISOString();
    await this.persistFinalResult(
      bundle.tournament.id,
      match,
      participantIds,
      input,
      winnerTeamId,
      finalizedAt,
      bundle.tournament,
    );
    return readSnapshot(this.db, tournamentId);
  }

  private async persistFinalResult(
    tournamentId: string,
    match: MatchRecord,
    participantIds: [string, string],
    input: FinalizeMatchInput,
    winnerTeamId: string | null,
    finalizedAt: string,
    tournament: (typeof tournaments.$inferSelect),
  ): Promise<void> {
    const awards = outcomeAwards(match, participantIds, input, winnerTeamId, tournament, this.createId);
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(matches)
        .set({
          status: 'final',
          homeScore: input.home,
          awayScore: input.away,
          winnerTeamId,
          finalizedAt,
        })
        .where(and(eq(matches.id, match.id), eq(matches.tournamentId, tournamentId)));
      if (awards.length > 0) await transaction.insert(pointEntries).values(awards);
      await transaction
        .update(tournaments)
        .set({ status: 'running', updatedAt: finalizedAt })
        .where(eq(tournaments.id, tournamentId));
    });
  }
}

async function readSnapshot(db: TournamentDatabase, tournamentId: string): Promise<TournamentSnapshot> {
  const bundle = await readTournamentBundle(db, tournamentId);
  return createTournamentSnapshot(bundle);
}

function ensureTournamentOpen(status: string): void {
  if (status === 'closed') throw conflict('This tournament is closed.');
}

function activeTeam(teamRecords: TeamRecord[], teamId: string): TeamRecord {
  const team = teamRecords.find((item) => item.id === teamId && item.withdrawnAt === null);
  if (!team) throw notFound('Active team not found in this tournament.');
  return team;
}

function scopedMatch(matchRecords: MatchRecord[], matchId: string): MatchRecord {
  const match = matchRecords.find((item) => item.id === matchId);
  if (!match) throw notFound('Match not found in this tournament.');
  return match;
}

function ensureScoreCanChange(status: string): void {
  if (status === 'final') throw conflict('A final score cannot be changed from the live-score screen.');
  if (status === 'cancelled') throw conflict('A called-off match cannot receive a score.');
}

function validateScore(home: number, away: number): void {
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 999 || away > 999) {
    throw unprocessable('Enter whole-number scores from 0 to 999.');
  }
}

function ensureResolvedTeams(
  match: MatchRecord,
  bundle: Awaited<ReturnType<typeof readTournamentBundle>>,
): [string, string] {
  const context = createResolutionContext(bundle.teams, bundle.matches, bundle.ledger);
  const home = resolveParticipant(match.homeSlot, context);
  const away = resolveParticipant(match.awaySlot, context);
  if (!home.teamId || !away.teamId) throw conflict('Both team slots must be resolved before scoring this match.');
  if (home.teamId === away.teamId) throw conflict('A team cannot play itself.');
  return [home.teamId, away.teamId];
}

function decideWinner(
  input: FinalizeMatchInput,
  [homeId, awayId]: [string, string],
  allMatches: MatchRecord[],
  match: MatchRecord,
): string | null {
  const scoredWinner = input.home > input.away ? homeId : input.away > input.home ? awayId : null;
  if (input.advancingTeamId && ![homeId, awayId].includes(input.advancingTeamId)) {
    throw unprocessable('The advancing team must be one of the two teams in this match.');
  }
  if (scoredWinner && input.advancingTeamId && scoredWinner !== input.advancingTeamId) {
    throw unprocessable('The higher-scoring team must advance.');
  }
  if (input.home === input.away && hasOutcomeFollowers(match.id, allMatches) && !input.advancingTeamId) {
    throw unprocessable('Choose which team advances after a tied elimination score.');
  }
  return input.advancingTeamId ?? scoredWinner;
}

function hasOutcomeFollowers(matchId: string, allMatches: MatchRecord[]): boolean {
  return allMatches.some((match) =>
    [match.homeSlot, match.awaySlot].some(
      (slot) => (slot.kind === 'winner' || slot.kind === 'loser') && slot.matchId === matchId,
    ),
  );
}

function outcomeAwards(
  match: MatchRecord,
  [homeId, awayId]: [string, string],
  input: FinalizeMatchInput,
  winnerTeamId: string | null,
  tournament: typeof tournaments.$inferSelect,
  createId: () => string,
) {
  const homePoints = awardForTeam(homeId, input, winnerTeamId, tournament);
  const awayPoints = awardForTeam(awayId, input, winnerTeamId, tournament);
  return [homePoints, awayPoints].flatMap(({ teamId, points, result }) =>
    points > 0
      ? [{
          id: createId(),
          tournamentId: tournament.id,
          teamId,
          matchId: match.id,
          kind: 'outcome-award' as const,
          points,
          reason: result,
        }]
      : [],
  );
}

function awardForTeam(
  teamId: string,
  input: FinalizeMatchInput,
  winnerTeamId: string | null,
  tournament: typeof tournaments.$inferSelect,
): { teamId: string; points: number; result: string } {
  if (input.home === input.away && !winnerTeamId) {
    return { teamId, points: tournament.drawPoints, result: 'Match outcome: draw' };
  }
  const isWinner = teamId === winnerTeamId;
  return {
    teamId,
    points: isWinner ? tournament.winPoints : tournament.lossPoints,
    result: isWinner ? 'Match outcome: win' : 'Match outcome: loss',
  };
}

function createManualMatch(
  id: string,
  tournamentId: string,
  home: TeamRecord,
  away: TeamRecord,
  existingMatches: MatchRecord[],
  input: StageMatchInput,
  schedule: MatchRecord['schedule'],
): MatchRecord {
  return {
    id,
    tournamentId,
    code: `DESK-${id.slice(0, 8).toUpperCase()}`,
    phase: input.phase?.trim() || 'Desk-staged',
    roundNumber: input.roundNumber ?? Math.max(1, ...existingMatches.map((match) => match.roundNumber)),
    groupKey: null,
    position: Math.max(0, ...existingMatches.map((match) => match.position)) + 1,
    status: 'staged',
    homeSlot: { kind: 'team', teamId: home.id, label: home.name },
    awaySlot: { kind: 'team', teamId: away.id, label: away.name },
    dependsOn: [],
    schedule,
    score: null,
  };
}

function toMatchInsert(match: MatchRecord) {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    code: match.code,
    phase: match.phase,
    roundNumber: match.roundNumber,
    groupKey: match.groupKey,
    position: match.position,
    status: match.status,
    homeSlot: match.homeSlot,
    awaySlot: match.awaySlot,
    dependsOn: match.dependsOn,
    startMinute: match.schedule.startMinute,
    endMinute: match.schedule.endMinute,
    courtNumber: match.schedule.courtNumber,
    durationMinutes: match.schedule.durationMinutes,
  };
}
