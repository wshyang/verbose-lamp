import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type {
  Award,
  Court,
  Entrant,
  Group,
  Match,
  Slot,
  SlotSource,
  Stage,
  TournamentKind,
  TournamentState,
} from '@psd/tournament/core';
import type { Executor } from '../db/client.js';
import {
  tournamentAwards,
  tournamentCourts,
  tournamentEntrants,
  tournamentEvents,
  tournamentGroupEntrants,
  tournamentGroups,
  tournamentMatches,
  tournamentSlots,
  tournamentStageEntrants,
  tournamentStages,
  tournaments,
} from '../db/schema/index.js';
import type {
  TournamentAwardRow,
  TournamentEntrantRow,
  TournamentEventRow,
  TournamentMatchRow,
  TournamentRow,
  TournamentSlotRow,
  TournamentStageRow,
} from '../db/schema/index.js';
import { firstOrNull, required } from '../db/rows.js';

/**
 * ADR-275 — rows in, one engine `TournamentState` out (the core adapter's read half).
 *
 * This is the only place the database's shape meets the engine's: Drizzle maps the columns, and these
 * functions assemble the nested value the pure core decides over. Nothing here imports the scheduler
 * adapter or the app's people (ADR-272).
 */

export function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

type SourceReader = (row: TournamentSlotRow) => SlotSource;

/** One small reader per source kind: the slot row's nullable columns, read back as the engine's union. */
/*
 * The slot table's CHECKs guarantee each kind's columns, so a missing one is a database that is not
 * what this code thinks it is — `required` says so rather than inventing an empty id (ADR-013).
 */
const SOURCE_READERS: Record<TournamentSlotRow['sourceKind'], SourceReader> = {
  entrant: (row) => ({ kind: 'entrant', entrantId: required(row.sourceEntrantId, 'entrant slot') }),
  winner_of: (row) => ({ kind: 'winner_of', matchId: required(row.sourceMatchId, 'winner slot') }),
  loser_of: (row) => ({ kind: 'loser_of', matchId: required(row.sourceMatchId, 'loser slot') }),
  group_place: (row) => ({ kind: 'group_place', groupId: required(row.sourceGroupId, 'group slot'), place: required(row.sourcePlace, 'group place') }),
  stage_place: (row) => ({ kind: 'stage_place', stageId: required(row.sourceStageId, 'stage slot'), place: required(row.sourcePlace, 'stage place') }),
  pairing: (row) => ({
    kind: 'pairing',
    stageId: required(row.sourceStageId, 'pairing slot'),
    round: required(row.sourceRound, 'pairing round'),
    // A pairing's index is 0-based in the engine; the column holds places, which start at 1.
    pairIndex: required(row.sourcePlace, 'pairing place') - 1,
    side: row.side,
  }),
  vacant: () => ({ kind: 'vacant' }),
};

function sourceOf(row: TournamentSlotRow): SlotSource {
  return SOURCE_READERS[row.sourceKind](row);
}

/** Every match is written with both its slots in the same insert (`insertMatches`), so a slot is never missing. */
function slotOf(row: TournamentSlotRow | undefined): Slot {
  const slot = required(row, 'match slot');
  return { source: sourceOf(slot), label: slot.label, seatedEntrantId: slot.seatedEntrantId, seatOverrideReason: slot.seatOverrideReason };
}

function startedByOf(row: TournamentMatchRow): Match['startedBy'] {
  if (row.startedByKind === null || row.startedById === null) return null;
  return { kind: row.startedByKind, id: row.startedById, label: required(row.startedByLabel, 'starter label') };
}

export function matchOf(row: TournamentMatchRow, slots: { a: TournamentSlotRow | undefined; b: TournamentSlotRow | undefined }): Match {
  return {
    id: row.id,
    code: row.code,
    stageId: row.stageId,
    groupId: row.groupId,
    round: row.round,
    sequence: row.sequence,
    origin: row.origin,
    isPlacement: row.isPlacement,
    status: row.status,
    courtId: row.courtId,
    plannedStartAt: iso(row.plannedStartAt),
    plannedMinutes: row.plannedMinutes,
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    startedBy: startedByOf(row),
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    result: row.resultKind === null ? null : { kind: row.resultKind, winnerSide: row.winnerSide },
    isVoided: row.isVoided,
    cancelReason: row.cancelReason,
    version: row.version,
    slots: { a: slotOf(slots.a), b: slotOf(slots.b) },
  };
}

/** ADR-325 — the frozen roster of each fed stage, in place order. */
async function loadRosters(db: Executor, stageIds: readonly string[]): Promise<Map<string, string[]>> {
  const rosters = new Map<string, string[]>();
  if (stageIds.length === 0) return rosters;
  const rows = await db
    .select()
    .from(tournamentStageEntrants)
    .where(inArray(tournamentStageEntrants.stageId, [...stageIds]))
    .orderBy(asc(tournamentStageEntrants.place));
  for (const row of rows) rosters.set(row.stageId, [...(rosters.get(row.stageId) ?? []), row.entrantId]);
  return rosters;
}

function stageOf(row: TournamentStageRow, roster: readonly string[]): Stage {
  const { winPoints, drawPoints, lossPoints } = row;
  const rates = winPoints !== null && drawPoints !== null && lossPoints !== null ? { win: winPoints, draw: drawPoints, loss: lossPoints } : null;
  const { tableWinPoints, tableDrawPoints, tableLossPoints } = row;
  const tablePoints =
    tableWinPoints !== null && tableDrawPoints !== null && tableLossPoints !== null
      ? { win: tableWinPoints, draw: tableDrawPoints, loss: tableLossPoints }
      : null;
  return {
    id: row.id,
    ordinal: row.ordinal,
    label: row.label,
    kind: row.kind,
    allowsDraws: row.allowsDraws,
    advanceCount: row.advanceCount,
    rates,
    tablePoints,
    intake: row.intakeStageId !== null && row.intakeCount !== null ? { fromStageId: row.intakeStageId, count: row.intakeCount } : null,
    roster,
    status: row.status,
  };
}

function awardOf(row: TournamentAwardRow): Award {
  return {
    id: row.id,
    entrantId: row.entrantId,
    matchId: row.matchId,
    kind: row.kind,
    points: row.points,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    voidedAt: iso(row.voidedAt),
  };
}

function entrantOf(row: TournamentEntrantRow): Entrant {
  return { id: row.id, name: row.nameSnapshot, entryOrder: row.entryOrder, withdrawnAt: iso(row.withdrawnAt) };
}

/**
 * ADR-293 — the default kind: every resolver that is not explicitly given a kind uses this, so
 * all existing callers keep working without change while the feature scaffolds future types.
 */
const DEFAULT_KIND: TournamentKind = 'captains_ball';

/*
 * ADR-345 — the four finders below are primitives, not a vocabulary: composing them is the day
 * policy's job, in `dayPolicy.ts` (one named function per real policy, its axes stated and
 * matrix-tested). `commands.ts` keeps its one sanctioned use — the kind is dynamic there and
 * the resolution belongs inside the engine's transaction — and the standards rule
 * `tournament-day-policy` refuses these names everywhere else.
 */

/**
 * The tournament the day is running for this game kind: at most one is draft or live per kind
 * (`ux_tournament_one_open_per_kind`, ADR-293). Defaults to `captains_ball` so existing callers
 * that omit `kind` continue to resolve the Captain's Ball tournament unchanged.
 */
export async function findOpenTournament(db: Executor, kind: TournamentKind = DEFAULT_KIND): Promise<TournamentRow | null> {
  return firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(and(inArray(tournaments.status, ['draft', 'live']), eq(tournaments.kind, kind)))
      .limit(1),
  );
}

/**
 * The tournament the day is showing for this game kind (ADR-277): the live one, else the one closed
 * most recently — its results stand, so the feed and the tables do not go blank the moment the desk
 * closes the day. A draft is the desk's work in progress and shows nobody anything, and neither does
 * a draft the desk discarded (closed without ever starting): it would read to the room as a day
 * already played.
 */
export async function findDayTournament(db: Executor, kind: TournamentKind = DEFAULT_KIND): Promise<TournamentRow | null> {
  const live = firstOrNull(await db.select().from(tournaments).where(and(eq(tournaments.status, 'live'), eq(tournaments.kind, kind))).limit(1));
  if (live !== null) return live;
  const played = and(eq(tournaments.status, 'closed'), isNotNull(tournaments.startedAt), eq(tournaments.kind, kind));
  return firstOrNull(await db.select().from(tournaments).where(played).orderBy(desc(tournaments.closedAt)).limit(1));
}

/** The desk's tournament for this game kind: the open one (draft or live), else the one closed most recently. */
export async function findDeskTournament(db: Executor, kind: TournamentKind = DEFAULT_KIND): Promise<TournamentRow | null> {
  const open = await findOpenTournament(db, kind);
  if (open !== null) return open;
  return firstOrNull(
    await db
      .select()
      .from(tournaments)
      .where(and(eq(tournaments.status, 'closed'), eq(tournaments.kind, kind)))
      .orderBy(desc(tournaments.closedAt))
      .limit(1),
  );
}

/**
 * ADR-321 — the desk's tournament whatever its kind: an open one first (captain's ball preferred
 * when both kinds are open), else the one closed most recently. The console is modal — it runs
 * the tournament the day is operating — while kind-specific machinery keeps its own finders.
 */
export async function findDeskTournamentAnyKind(db: Executor): Promise<TournamentRow | null> {
  for (const kind of ['captains_ball', 'dumb_courts'] as const) {
    const open = await findOpenTournament(db, kind);
    if (open !== null) return open;
  }
  return firstOrNull(
    await db.select().from(tournaments).where(eq(tournaments.status, 'closed')).orderBy(desc(tournaments.closedAt)).limit(1),
  );
}

/** The day's history, newest first, bounded: the console shows the recent past, not the archive. */
export async function listEvents(db: Executor, input: { tournamentId: string; limit: number }): Promise<TournamentEventRow[]> {
  return db
    .select()
    .from(tournamentEvents)
    .where(eq(tournamentEvents.tournamentId, input.tournamentId))
    .orderBy(desc(tournamentEvents.at))
    .limit(input.limit);
}

export async function listCourts(db: Executor): Promise<Court[]> {
  const rows = await db.select().from(tournamentCourts).orderBy(asc(tournamentCourts.courtNumber));
  return rows.map((row) => ({ id: row.id, label: row.label, isEnabled: row.isEnabled }));
}

async function loadGroups(db: Executor, stageIds: readonly string[]): Promise<Group[]> {
  if (stageIds.length === 0) return [];
  const groups = (await db.select().from(tournamentGroups).where(inArray(tournamentGroups.stageId, [...stageIds]))).filter((row) => row.supersededAt === null);
  if (groups.length === 0) return [];
  const members = await db
    .select()
    .from(tournamentGroupEntrants)
    .where(inArray(tournamentGroupEntrants.groupId, groups.map((group) => group.id)))
    .orderBy(asc(tournamentGroupEntrants.seed));
  return groups.map((group) => ({
    id: group.id,
    stageId: group.stageId,
    code: group.code,
    label: group.label,
    entrantIds: members.filter((member) => member.groupId === group.id).map((member) => member.entrantId),
  }));
}

async function loadMatches(db: Executor, tournamentId: string): Promise<Match[]> {
  const rows = await db
    .select()
    .from(tournamentMatches)
    .where(and(eq(tournamentMatches.tournamentId, tournamentId), ne(tournamentMatches.status, 'superseded')))
    .orderBy(asc(tournamentMatches.sequence));
  if (rows.length === 0) return [];
  const slots = await db.select().from(tournamentSlots).where(inArray(tournamentSlots.matchId, rows.map((row) => row.id)));
  const bySide = new Map(slots.map((slot) => [`${slot.matchId}:${slot.side}`, slot]));
  return rows.map((row) => matchOf(row, { a: bySide.get(`${row.id}:a`), b: bySide.get(`${row.id}:b`) }));
}

/** The whole tournament as the engine sees it. One read per table, bounded by one tournament. */
export async function loadState(db: Executor, row: TournamentRow): Promise<TournamentState> {
  const entrants = await db
    .select()
    .from(tournamentEntrants)
    .where(eq(tournamentEntrants.tournamentId, row.id))
    .orderBy(asc(tournamentEntrants.entryOrder));
  const stages = await db.select().from(tournamentStages).where(eq(tournamentStages.tournamentId, row.id)).orderBy(asc(tournamentStages.ordinal));
  const awards = await db.select().from(tournamentAwards).where(eq(tournamentAwards.tournamentId, row.id)).orderBy(asc(tournamentAwards.createdAt));
  const rosters = await loadRosters(db, stages.map((stage) => stage.id));
  return {
    tournament: {
      id: row.id,
      name: row.name,
      status: row.status,
      kind: row.kind,
      rates: { win: row.winPoints, draw: row.drawPoints, loss: row.lossPoints },
      closeReason: row.closeReason,
      pausedAt: iso(row.pausedAt),
    },
    entrants: entrants.map(entrantOf),
    stages: stages.map((stage) => stageOf(stage, rosters.get(stage.id) ?? [])),
    groups: await loadGroups(db, stages.map((stage) => stage.id)),
    matches: await loadMatches(db, row.id),
    awards: awards.map(awardOf),
    courts: await listCourts(db),
  };
}

/** Entrant id → app team id: the one seam the core keeps with the app (ADR-272). */
export async function entrantTeams(db: Executor, tournamentId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: tournamentEntrants.id, teamId: tournamentEntrants.teamId })
    .from(tournamentEntrants)
    .where(eq(tournamentEntrants.tournamentId, tournamentId));
  return new Map(rows.map((row) => [row.id, row.teamId]));
}
