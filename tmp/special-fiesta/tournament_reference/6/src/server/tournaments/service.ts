import { v7 as uuidv7 } from 'uuid';
import { desc, eq } from 'drizzle-orm';
import type {
  CreateTournamentInput,
  PreviewInput,
  SimulationResult,
  TournamentRecord,
  TournamentSnapshot,
  WeatherChangeInput,
} from '../../shared/contracts.js';
import { conflict, unprocessable } from '../errors.js';
import type { TournamentDatabase } from '../db/database.js';
import { matches, teams as teamsTable, tournaments } from '../db/schema.js';
import { buildTournamentBlueprint } from './generator.js';
import { createMatchViews, createTournamentSnapshot, readTournamentBundle, toTournamentRecord } from './read-model.js';
import { reflowStagedMatches } from './scheduler.js';
import { validateModeTeamCount } from './validation.js';

export class TournamentService {
  constructor(
    private readonly db: TournamentDatabase,
    private readonly createId: () => string = uuidv7,
  ) {}

  async preview(input: PreviewInput): Promise<SimulationResult> {
    validateModeTeamCount(input.mode, input.settings.teamCount);
    const blueprint = buildTournamentBlueprint({
      tournamentId: this.createId(),
      mode: input.mode,
      settings: input.settings,
      teamNames: input.teamNames,
      createId: this.createId,
    });
    return {
      mode: input.mode,
      teams: blueprint.teams,
      matches: createMatchViews(blueprint.teams, blueprint.matches, []),
      scheduleSummary: blueprint.scheduleSummary,
      groupKeys: blueprint.groupKeys,
    };
  }

  async create(input: CreateTournamentInput): Promise<TournamentSnapshot> {
    validateModeTeamCount(input.mode, input.settings.teamCount);
    const tournamentId = this.createId();
    const blueprint = buildTournamentBlueprint({
      tournamentId,
      mode: input.mode,
      settings: input.settings,
      teamNames: input.teamNames,
      createId: this.createId,
    });
    await this.insertTournament(input, tournamentId, blueprint);
    return this.get(tournamentId);
  }

  async list(): Promise<TournamentRecord[]> {
    const rows = await this.db
      .select()
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt))
      .limit(12);
    return rows.map(toTournamentRecord);
  }

  async get(tournamentId: string): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    return createTournamentSnapshot(bundle);
  }

  async changeResources(
    tournamentId: string,
    input: WeatherChangeInput,
  ): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    if (bundle.tournament.status === 'closed') throw conflict('A closed tournament cannot be rescheduled.');
    validateWeatherChange(input, bundle.tournament.startTimeMinutes);
    const settings = { ...bundle.tournament, ...input };
    const updatedMatches = reflowStagedMatches(bundle.matches, settings, input.effectiveAtMinutes);
    await this.persistWeatherChange(tournamentId, input, updatedMatches);
    return this.get(tournamentId);
  }

  async close(tournamentId: string, reasonValue: unknown): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    if (bundle.tournament.status === 'closed') throw conflict('This tournament is already closed.');
    if (bundle.matches.some((match) => match.status === 'live')) {
      throw conflict('Finish or call off every live match before closing the tournament.');
    }
    const reason = optionalReason(reasonValue);
    const hasUnfinishedMatches = bundle.matches.some(
      (match) => match.status !== 'final' && match.status !== 'cancelled',
    );
    if (hasUnfinishedMatches && !reason) {
      throw unprocessable('Add a reason when closing with matches still to play.');
    }
    await this.db
      .update(tournaments)
      .set({
        status: 'closed',
        closingReason: reason ?? 'All scheduled matches completed.',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tournaments.id, tournamentId));
    return this.get(tournamentId);
  }

  private async insertTournament(
    input: CreateTournamentInput,
    tournamentId: string,
    blueprint: ReturnType<typeof buildTournamentBlueprint>,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.insert(tournaments).values({
        id: tournamentId,
        name: input.name,
        mode: input.mode,
        status: 'scheduled',
        teamCount: input.settings.teamCount,
        courtCount: input.settings.courtCount,
        matchDurationMinutes: input.settings.matchDurationMinutes,
        tournamentLengthMinutes: input.settings.tournamentLengthMinutes,
        startTimeMinutes: input.settings.startTimeMinutes,
        winPoints: 3,
        drawPoints: 1,
        lossPoints: 0,
      });
      if (blueprint.teams.length > 0) await transaction.insert(teamsTable).values(blueprint.teams);
      if (blueprint.matches.length > 0) {
        await transaction.insert(matches).values(blueprint.matches.map(toMatchInsert));
      }
    });
  }

  private async persistWeatherChange(
    tournamentId: string,
    input: WeatherChangeInput,
    updatedMatches: ReturnType<typeof reflowStagedMatches>,
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(tournaments)
        .set({
          courtCount: input.courtCount,
          matchDurationMinutes: input.matchDurationMinutes,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tournaments.id, tournamentId));
      for (const match of updatedMatches.filter((item) => item.status === 'staged')) {
        await transaction
          .update(matches)
          .set({
            startMinute: match.schedule.startMinute,
            endMinute: match.schedule.endMinute,
            courtNumber: match.schedule.courtNumber,
            durationMinutes: match.schedule.durationMinutes,
          })
          .where(eq(matches.id, match.id));
      }
    });
  }
}

function validateWeatherChange(input: WeatherChangeInput, startTimeMinutes: number): void {
  if (!Number.isInteger(input.courtCount) || input.courtCount < 1 || input.courtCount > 20) {
    throw unprocessable('Available courts must be between 1 and 20.');
  }
  if (
    !Number.isInteger(input.matchDurationMinutes) ||
    input.matchDurationMinutes < 5 ||
    input.matchDurationMinutes > 120
  ) {
    throw unprocessable('Match length must be between 5 and 120 minutes.');
  }
  if (
    !Number.isInteger(input.effectiveAtMinutes) ||
    input.effectiveAtMinutes < startTimeMinutes ||
    input.effectiveAtMinutes > 2879
  ) {
    throw unprocessable('Change time must be at or after the tournament start.');
  }
}

function optionalReason(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 500) {
    throw unprocessable('Reason must be 500 characters or fewer.');
  }
  return value.trim() || null;
}

function toMatchInsert(match: ReturnType<typeof buildTournamentBlueprint>['matches'][number]) {
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
