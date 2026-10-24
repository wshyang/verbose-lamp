import { v7 as uuidv7 } from 'uuid';
import type {
  AwardPointsInput,
  TournamentSnapshot,
} from '../../shared/contracts.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import type { TournamentDatabase } from '../db/database.js';
import { pointEntries } from '../db/schema.js';
import { readTournamentBundle } from './read-model.js';
import { createTournamentSnapshot } from './read-model.js';

export class PointsService {
  constructor(
    private readonly db: TournamentDatabase,
    private readonly createId: () => string = uuidv7,
  ) {}

  async award(tournamentId: string, input: AwardPointsInput): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    if (bundle.tournament.status === 'closed') throw conflict('A closed tournament cannot receive points.');
    validateAward(input);
    const team = bundle.teams.find((item) => item.id === input.teamId && item.withdrawnAt === null);
    if (!team) throw notFound('Active team not found in this tournament.');
    if (input.matchId && !bundle.matches.some((match) => match.id === input.matchId)) {
      throw notFound('Match not found in this tournament.');
    }
    await this.db.insert(pointEntries).values({
      id: this.createId(),
      tournamentId,
      teamId: team.id,
      matchId: input.matchId ?? null,
      kind: 'desk-award',
      points: input.points,
      reason: input.reason.trim(),
    });
    return getSnapshot(this.db, tournamentId);
  }

  async voidAward(tournamentId: string, entryId: string, reasonValue: unknown): Promise<TournamentSnapshot> {
    const bundle = await readTournamentBundle(this.db, tournamentId);
    if (bundle.tournament.status === 'closed') throw conflict('A closed tournament cannot change its points record.');
    const award = bundle.ledger.find((entry) => entry.id === entryId);
    if (!award) throw notFound('Point award not found in this tournament.');
    if (award.kind === 'void') throw conflict('A point reversal cannot itself be voided.');
    if (bundle.ledger.some((entry) => entry.voidsEntryId === award.id)) {
      throw conflict('This point award has already been voided.');
    }
    const reason = requiredReason(reasonValue);
    await this.db.insert(pointEntries).values({
      id: this.createId(),
      tournamentId,
      teamId: award.teamId,
      matchId: award.matchId,
      kind: 'void',
      points: -award.points,
      reason: `Voided: ${reason}`,
      voidsEntryId: award.id,
    });
    return getSnapshot(this.db, tournamentId);
  }
}

async function getSnapshot(db: TournamentDatabase, tournamentId: string): Promise<TournamentSnapshot> {
  const bundle = await readTournamentBundle(db, tournamentId);
  return createTournamentSnapshot(bundle);
}

function validateAward(input: AwardPointsInput): void {
  if (!Number.isInteger(input.points) || input.points < 1 || input.points > 10000) {
    throw unprocessable('Award between 1 and 10,000 points.');
  }
  requiredReason(input.reason);
}

function requiredReason(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 500) {
    throw unprocessable('Add a reason of 1 to 500 characters.');
  }
  return value.trim();
}
