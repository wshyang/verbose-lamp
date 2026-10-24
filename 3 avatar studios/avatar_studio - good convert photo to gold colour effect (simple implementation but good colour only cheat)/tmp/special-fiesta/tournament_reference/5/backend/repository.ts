import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from './db.js';
import * as schema from './schema.js';
import { newId } from './ids.js';
import { generateFormat } from '../shared/formats/index.js';
import { scheduleMatches } from '../shared/schedule.js';
import { computeStandings } from '../shared/standings.js';
import type { SlotSource, TournamentConfig, TournamentGraph } from '../shared/types.js';

type TournamentRow = typeof schema.tournaments.$inferSelect;
type MatchRow = typeof schema.matches.$inferSelect;
type PointsRow = typeof schema.pointsEntries.$inferSelect;

export function rewriteTeamSlot(slot: SlotSource, teamIds: Map<string, string>, names: Map<string, string>): SlotSource {
  if (slot.kind !== 'team') return slot;
  const id = teamIds.get(slot.teamRef) as string;
  return { kind: 'team', teamRef: id, label: names.get(slot.teamRef) as string };
}

export async function createTournament(
  db: Database,
  input: { name: string; mode: string; config: TournamentConfig; teamNames: string[] },
): Promise<TournamentGraph> {
  const tournamentId = newId();
  await db.insert(schema.tournaments).values({
    id: tournamentId, name: input.name, mode: input.mode, status: 'live', config: input.config,
  });
  const teamIds = new Map<string, string>();
  const names = new Map<string, string>();
  for (const [index, name] of input.teamNames.entries()) {
    const id = newId();
    teamIds.set(`team-${index + 1}`, id);
    names.set(`team-${index + 1}`, name);
    await db.insert(schema.teams).values({ id, tournamentId, name, seed: index + 1 });
  }
  const courtIds: string[] = [];
  for (let index = 0; index < input.config.courts; index += 1) {
    const id = newId();
    courtIds.push(id);
    await db.insert(schema.courts).values({ id, tournamentId, name: `Court ${index + 1}` });
  }
  const scheduled = scheduleMatches(generateFormat(input.mode, input.teamNames.length), input.config);
  for (const match of scheduled) {
    await db.insert(schema.matches).values({
      id: newId(), tournamentId, matchKey: match.key, phase: match.phase, groupKey: match.groupKey,
      round: match.round,
      slotA: rewriteTeamSlot(match.slotA, teamIds, names),
      slotB: rewriteTeamSlot(match.slotB, teamIds, names),
      dependsOn: match.dependsOn,
      courtId: match.court === null ? null : courtIds[match.court - 1],
      startMinutes: match.startMinutes, endMinutes: match.endMinutes,
      status: 'scheduled', origin: 'generated',
    });
  }
  return getGraph(db, tournamentId) as Promise<TournamentGraph>;
}

export async function getGraph(db: Database, tournamentId: string): Promise<TournamentGraph | null> {
  const tournament = await loadTournament(db, tournamentId);
  if (tournament === null) return null;
  const teamRows = await db.select().from(schema.teams)
    .where(and(eq(schema.teams.tournamentId, tournamentId), isNull(schema.teams.deletedAt)))
    .orderBy(asc(schema.teams.seed));
  const courtRows = await db.select().from(schema.courts)
    .where(and(eq(schema.courts.tournamentId, tournamentId), isNull(schema.courts.deletedAt)))
    .orderBy(asc(schema.courts.name));
  const allCourts = await db.select().from(schema.courts)
    .where(eq(schema.courts.tournamentId, tournamentId));
  const matchRows = await db.select().from(schema.matches)
    .where(and(eq(schema.matches.tournamentId, tournamentId), isNull(schema.matches.deletedAt)))
    .orderBy(asc(schema.matches.startMinutes), asc(schema.matches.matchKey));
  const pointRows = await db.select().from(schema.pointsEntries)
    .where(and(eq(schema.pointsEntries.tournamentId, tournamentId), isNull(schema.pointsEntries.deletedAt)))
    .orderBy(asc(schema.pointsEntries.createdAt));
  return assembleGraph(tournament, { teamRows, courtRows, allCourts, matchRows, pointRows });
}

function assembleGraph(
  tournament: TournamentRow,
  rows: {
    teamRows: (typeof schema.teams.$inferSelect)[];
    courtRows: (typeof schema.courts.$inferSelect)[];
    allCourts: (typeof schema.courts.$inferSelect)[];
    matchRows: MatchRow[];
    pointRows: PointsRow[];
  },
): TournamentGraph {
  const courtName = new Map(rows.allCourts.map((court) => [court.id, court.name]));
  const teams = rows.teamRows.map((team) => ({ id: team.id, name: team.name, seed: team.seed }));
  const matches = rows.matchRows.map((match) => ({
    id: match.id, key: match.matchKey, phase: match.phase, groupKey: match.groupKey,
    round: match.round, slotA: match.slotA, slotB: match.slotB, dependsOn: match.dependsOn,
    courtId: match.courtId, courtName: match.courtId === null ? null : (courtName.get(match.courtId) as string),
    startMinutes: match.startMinutes, endMinutes: match.endMinutes,
    status: match.status as TournamentGraph['matches'][number]['status'],
    scoreA: match.scoreA, scoreB: match.scoreB,
    origin: match.origin as 'generated' | 'manual',
  }));
  const pointsEntries = rows.pointRows.map((entry) => ({
    id: entry.id, teamId: entry.teamId, matchId: entry.matchId, points: entry.points,
    reason: entry.reason, status: entry.status as 'active' | 'voided', voidReason: entry.voidReason,
  }));
  return {
    tournament: {
      id: tournament.id, name: tournament.name, mode: tournament.mode,
      status: tournament.status as TournamentGraph['tournament']['status'], config: tournament.config,
    },
    teams,
    courts: rows.courtRows.map((court) => ({ id: court.id, name: court.name })),
    matches,
    pointsEntries,
    standings: computeStandings(teams, matches, pointsEntries),
  };
}

export async function listTournaments(db: Database): Promise<TournamentGraph['tournament'][]> {
  const rows = await db.select().from(schema.tournaments)
    .where(isNull(schema.tournaments.deletedAt)).orderBy(asc(schema.tournaments.createdAt));
  return rows.map((row) => ({
    id: row.id, name: row.name, mode: row.mode,
    status: row.status as TournamentGraph['tournament']['status'], config: row.config,
  }));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadTournament(db: Database, id: string): Promise<TournamentRow | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const rows = await db.select().from(schema.tournaments)
    .where(and(eq(schema.tournaments.id, id), isNull(schema.tournaments.deletedAt)));
  return rows[0] ?? null;
}

export async function loadMatch(db: Database, id: string): Promise<MatchRow | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const rows = await db.select().from(schema.matches)
    .where(and(eq(schema.matches.id, id), isNull(schema.matches.deletedAt)));
  return rows[0] ?? null;
}

export async function loadPointsEntry(db: Database, id: string): Promise<PointsRow | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const rows = await db.select().from(schema.pointsEntries)
    .where(and(eq(schema.pointsEntries.id, id), isNull(schema.pointsEntries.deletedAt)));
  return rows[0] ?? null;
}
