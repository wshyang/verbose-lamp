import { and, eq, sql } from 'drizzle-orm';
import type { Award, Group, Match, Slot, Stage, TournamentEvent, TournamentState } from '@psd/tournament/core';
import type { Executor } from '../db/client.js';
import { newId } from '../db/ids.js';
import {
  tournamentAwards,
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

/**
 * ADR-275 — the core adapter's write half: what changed between the state an engine command was
 * given and the state it returned, written in the caller's transaction.
 *
 * The diff is by value, which is affordable because a day is human-sized (H2): a few dozen matches.
 * Inserts go in foreign-key order and nothing is ever deleted — the engine only appends and updates.
 */

export interface Written {
  newMatches: readonly Match[];
  startedMatches: readonly Match[];
  newAwards: readonly Award[];
}

function differs(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function date(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function placeOf(slot: Slot): number | null {
  const source = slot.source;
  if (source.kind === 'group_place' || source.kind === 'stage_place') return source.place;
  // A pairing's index is 0-based in the engine; the column holds places, which start at 1.
  return source.kind === 'pairing' ? source.pairIndex + 1 : null;
}

function slotRow(match: Match, side: 'a' | 'b') {
  const slot = match.slots[side];
  const source = slot.source;
  return {
    matchId: match.id,
    side,
    sourceKind: source.kind,
    sourceEntrantId: source.kind === 'entrant' ? source.entrantId : null,
    sourceMatchId: source.kind === 'winner_of' || source.kind === 'loser_of' ? source.matchId : null,
    sourceGroupId: source.kind === 'group_place' ? source.groupId : null,
    sourceStageId: source.kind === 'stage_place' || source.kind === 'pairing' ? source.stageId : null,
    sourcePlace: placeOf(slot),
    sourceRound: source.kind === 'pairing' ? source.round : null,
    label: slot.label.slice(0, 60),
    seatedEntrantId: slot.seatedEntrantId,
    seatOverrideReason: slot.seatOverrideReason,
  };
}

/** The writable slot columns for an update (the primary key stays out of the SET list). */
function slotColumns(match: Match, side: 'a' | 'b') {
  const row = slotRow(match, side);
  return {
    sourceKind: row.sourceKind,
    sourceEntrantId: row.sourceEntrantId,
    sourceMatchId: row.sourceMatchId,
    sourceGroupId: row.sourceGroupId,
    sourceStageId: row.sourceStageId,
    sourcePlace: row.sourcePlace,
    sourceRound: row.sourceRound,
    label: row.label,
    seatedEntrantId: row.seatedEntrantId,
    seatOverrideReason: row.seatOverrideReason,
  };
}

function matchColumns(match: Match) {
  return {
    status: match.status,
    courtId: match.courtId,
    plannedStartAt: date(match.plannedStartAt),
    plannedMinutes: match.plannedMinutes,
    startedAt: date(match.startedAt),
    endedAt: date(match.endedAt),
    startedByKind: match.startedBy?.kind ?? null,
    startedById: match.startedBy?.id ?? null,
    startedByLabel: match.startedBy?.label ?? null,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    resultKind: match.result?.kind ?? null,
    winnerSide: match.result?.winnerSide ?? null,
    isVoided: match.isVoided,
    cancelReason: match.cancelReason,
    version: match.version,
  };
}

/** New matches and their two slots. Slots go after every match, because a slot may read another new one. */
export async function insertMatches(tx: Executor, input: { tournamentId: string; matches: readonly Match[] }): Promise<void> {
  if (input.matches.length === 0) return;
  await tx.insert(tournamentMatches).values(
    input.matches.map((match) => ({
      id: match.id,
      tournamentId: input.tournamentId,
      stageId: match.stageId,
      groupId: match.groupId,
      code: match.code,
      round: match.round,
      sequence: match.sequence,
      origin: match.origin,
      isPlacement: match.isPlacement,
      ...matchColumns(match),
    })),
  );
  await tx.insert(tournamentSlots).values(input.matches.flatMap((match) => [slotRow(match, 'a'), slotRow(match, 'b')]));
}

async function updateMatch(tx: Executor, match: Match): Promise<void> {
  await tx.update(tournamentMatches).set(matchColumns(match)).where(eq(tournamentMatches.id, match.id));
  for (const side of ['a', 'b'] as const) {
    await tx
      .update(tournamentSlots)
      .set(slotColumns(match, side))
      .where(and(eq(tournamentSlots.matchId, match.id), eq(tournamentSlots.side, side)));
  }
}

async function writeMatches(tx: Executor, input: { before: TournamentState; after: TournamentState }): Promise<Pick<Written, 'newMatches' | 'startedMatches'>> {
  const old = new Map(input.before.matches.map((match) => [match.id, match]));
  const fresh = input.after.matches.filter((match) => !old.has(match.id));
  const changed = input.after.matches.filter((match) => old.has(match.id) && differs(old.get(match.id), match));
  await insertMatches(tx, { tournamentId: input.after.tournament.id, matches: fresh });
  for (const match of changed) await updateMatch(tx, match);
  const started = [...fresh, ...changed].filter((match) => match.status === 'in_progress' && old.get(match.id)?.status !== 'in_progress');
  return { newMatches: fresh, startedMatches: started };
}

async function writeAwards(tx: Executor, input: { before: TournamentState; after: TournamentState; actorRow: ActorColumns }): Promise<Award[]> {
  const old = new Map(input.before.awards.map((award) => [award.id, award]));
  const fresh = input.after.awards.filter((award) => !old.has(award.id));
  if (fresh.length > 0) {
    await tx.insert(tournamentAwards).values(
      fresh.map((award) => ({
        id: award.id,
        tournamentId: input.after.tournament.id,
        entrantId: award.entrantId,
        matchId: award.matchId,
        kind: award.kind,
        points: award.points,
        reason: award.reason.slice(0, 200),
        ...input.actorRow,
        createdAt: new Date(award.createdAt),
        voidedAt: date(award.voidedAt),
      })),
    );
  }
  for (const award of input.after.awards) {
    const was = old.get(award.id);
    if (was !== undefined && was.voidedAt !== award.voidedAt) {
      await tx.update(tournamentAwards).set({ voidedAt: date(award.voidedAt) }).where(eq(tournamentAwards.id, award.id));
    }
  }
  return fresh;
}

function rateColumns(stage: Stage) {
  return {
    winPoints: stage.rates?.win ?? null,
    drawPoints: stage.rates?.draw ?? null,
    lossPoints: stage.rates?.loss ?? null,
  };
}

function tableColumns(stage: Stage) {
  return {
    tableWinPoints: stage.tablePoints?.win ?? null,
    tableDrawPoints: stage.tablePoints?.draw ?? null,
    tableLossPoints: stage.tablePoints?.loss ?? null,
  };
}

function stageColumns(stage: Stage) {
  return {
    kind: stage.kind,
    allowsDraws: stage.allowsDraws,
    advanceCount: stage.advanceCount,
    ...rateColumns(stage),
    ...tableColumns(stage),
    intakeStageId: stage.intake?.fromStageId ?? null,
    intakeCount: stage.intake?.count ?? null,
  };
}

async function writeStages(tx: Executor, input: { before: TournamentState; after: TournamentState; now: string }): Promise<void> {
  const old = new Map(input.before.stages.map((stage) => [stage.id, stage]));
  for (const stage of input.after.stages) {
    const was = old.get(stage.id);
    if (was === undefined || !differs(was, stage)) continue;
    await tx
      .update(tournamentStages)
      .set({ ...stageColumns(stage), status: stage.status, completedAt: stage.status === 'completed' ? new Date(input.now) : null })
      .where(eq(tournamentStages.id, stage.id));
  }
}

/**
 * ADR-334 — groups are insert-or-supersede: new fragment groups arrive whole, and a group that
 * was in the tournament before but is gone after has been replaced, never deleted.
 */
async function writeGroups(tx: Executor, input: { before: TournamentState; after: TournamentState; now: string }): Promise<void> {
  const old = new Map(input.before.groups.map((group) => [group.id, group]));
  const fresh = input.after.groups.filter((group) => !old.has(group.id));
  // Supersede first: a replacement group reuses its predecessor's code, and stage+code is unique.
  const afterIds = new Set(input.after.groups.map((group) => group.id));
  for (const group of input.before.groups) {
    if (afterIds.has(group.id)) continue;
    await tx.update(tournamentGroups).set({ supersededAt: new Date(input.now) }).where(eq(tournamentGroups.id, group.id));
  }
  if (fresh.length > 0) {
    await tx.insert(tournamentGroups).values(fresh.map((group) => ({ id: group.id, stageId: group.stageId, code: group.code, label: group.label })));
    const members = fresh.flatMap((group) => group.entrantIds.map((entrantId, index) => ({ groupId: group.id, entrantId, seed: index + 1 })));
    if (members.length > 0) await tx.insert(tournamentGroupEntrants).values(members);
  }
}

/**
 * ADR-325 — members filled into a group that had none (a pool dealt as seats, filled when its feeder
 * closed). Append-only: a group that already has rows is never rewritten, because membership that
 * has been written is somebody's decision.
 */
async function writeGroupMembers(tx: Executor, input: { before: TournamentState; after: TournamentState }): Promise<void> {
  const had = new Map(input.before.groups.map((group) => [group.id, group.entrantIds.length]));
  const rows = input.after.groups
    .filter((group) => (had.get(group.id) ?? 0) === 0 && group.entrantIds.length > 0)
    .flatMap((group) => group.entrantIds.map((entrantId, index) => ({ groupId: group.id, entrantId, seed: index + 1 })));
  if (rows.length > 0) await tx.insert(tournamentGroupEntrants).values(rows).onConflictDoNothing();
}

/** ADR-325 — a fed stage's roster, written once when its feeder closes and never rewritten. */
async function writeStageRosters(tx: Executor, input: { before: TournamentState; after: TournamentState }): Promise<void> {
  const had = new Map(input.before.stages.map((stage) => [stage.id, stage.roster.length]));
  const rows = input.after.stages
    .filter((stage) => (had.get(stage.id) ?? 0) === 0 && stage.roster.length > 0)
    .flatMap((stage) => stage.roster.map((entrantId, index) => ({ stageId: stage.id, entrantId, place: index + 1 })));
  if (rows.length > 0) await tx.insert(tournamentStageEntrants).values(rows).onConflictDoNothing();
}

async function writeEntrants(tx: Executor, input: { before: TournamentState; after: TournamentState; reason: string | null }): Promise<void> {
  const old = new Map(input.before.entrants.map((entrant) => [entrant.id, entrant]));
  for (const entrant of input.after.entrants) {
    if (old.get(entrant.id)?.withdrawnAt === entrant.withdrawnAt) continue;
    await tx
      .update(tournamentEntrants)
      .set({ withdrawnAt: date(entrant.withdrawnAt), withdrawReason: input.reason })
      .where(eq(tournamentEntrants.id, entrant.id));
  }
}

interface ActorColumns {
  createdByKind: 'facilitator' | 'superadmin' | 'system';
  createdById: string;
  createdByLabel: string;
}

async function writeEvents(tx: Executor, input: { tournamentId: string; events: readonly TournamentEvent[] }): Promise<void> {
  // Every accepted command records at least one event, bar a retry that changed nothing.
  if (input.events.length === 0) return;
  await tx.insert(tournamentEvents).values(
    input.events.map((event) => ({
      id: newId(),
      tournamentId: input.tournamentId,
      at: new Date(event.at),
      actorKind: event.actor.kind,
      actorId: event.actor.id,
      actorLabel: event.actor.label,
      kind: event.kind,
      matchId: event.matchId,
      reason: event.reason,
      detail: { ...event.detail },
    })),
  );
}

async function writeTournament(tx: Executor, input: { before: TournamentState; after: TournamentState; now: string }): Promise<void> {
  const closing = input.before.tournament.status !== 'closed' && input.after.tournament.status === 'closed';
  // The revision is bumped in SQL, so two commands racing on the same day serialise on this row.
  await tx
    .update(tournaments)
    .set({
      status: input.after.tournament.status,
      closeReason: input.after.tournament.closeReason,
      // ADR-336 — written from the state, not toggled: the pause is set once and never cleared.
      pausedAt: input.after.tournament.pausedAt === null ? null : new Date(input.after.tournament.pausedAt),
      ...(closing ? { closedAt: new Date(input.now) } : {}),
      revision: sql`${tournaments.revision} + 1`,
    })
    .where(eq(tournaments.id, input.after.tournament.id));
}

export interface PersistInput {
  before: TournamentState;
  after: TournamentState;
  events: readonly TournamentEvent[];
  now: string;
}

/** Writes everything a command changed, in the caller's transaction, and says what is new. */
export async function persistChanges(tx: Executor, input: PersistInput): Promise<Written> {
  const actor = input.events[0]?.actor ?? { kind: 'system' as const, id: input.after.tournament.id, label: 'system' };
  const reason = input.events.find((event) => event.kind === 'entrant_withdrawn')?.reason ?? null;
  await writeStages(tx, input);
  await writeGroups(tx, input);
  await writeGroupMembers(tx, input);
  await writeStageRosters(tx, input);
  await writeEntrants(tx, { before: input.before, after: input.after, reason });
  const matches = await writeMatches(tx, input);
  const newAwards = await writeAwards(tx, {
    before: input.before,
    after: input.after,
    actorRow: { createdByKind: actor.kind, createdById: actor.id, createdByLabel: actor.label },
  });
  await writeEvents(tx, { tournamentId: input.after.tournament.id, events: input.events });
  await writeTournament(tx, input);
  return { ...matches, newAwards };
}

export interface NewStructure {
  /** Stages carry the format's code ('GRP', 'KO') so the console and the views can name them. */
  stages: readonly (Stage & { code: string })[];
  groups: readonly Group[];
  matches: readonly Match[];
}

type StageWithCode = NewStructure['stages'][number];

/** A win/draw/loss triple as its three nullable columns: all set, or all null. */
function tripleColumns(points: { win: number; draw: number; loss: number } | null): [number | null, number | null, number | null] {
  return points === null ? [null, null, null] : [points.win, points.draw, points.loss];
}

/** One stage row: the paid rates and the internal table points are separate columns, on purpose. */
function stageRow(tournamentId: string, stage: StageWithCode) {
  const [winPoints, drawPoints, lossPoints] = tripleColumns(stage.rates);
  const [tableWinPoints, tableDrawPoints, tableLossPoints] = tripleColumns(stage.tablePoints);
  return {
    id: stage.id,
    tournamentId,
    code: stage.code,
    ordinal: stage.ordinal,
    label: stage.label,
    kind: stage.kind,
    allowsDraws: stage.allowsDraws,
    advanceCount: stage.advanceCount,
    winPoints,
    drawPoints,
    lossPoints,
    tableWinPoints,
    tableDrawPoints,
    tableLossPoints,
    intakeStageId: stage.intake?.fromStageId ?? null,
    intakeCount: stage.intake?.count ?? null,
    status: stage.status,
  };
}

/** A format's structure, already given ids, written whole (stages → groups → members → matches → slots). */
export async function insertStructure(tx: Executor, input: { tournamentId: string; structure: NewStructure }): Promise<void> {
  const { stages, groups, matches } = input.structure;
  if (stages.length > 0) {
    await tx.insert(tournamentStages).values(stages.map((stage) => stageRow(input.tournamentId, stage)));
  }
  if (groups.length > 0) {
    await tx.insert(tournamentGroups).values(groups.map((group) => ({ id: group.id, stageId: group.stageId, code: group.code, label: group.label })));
    const members = groups.flatMap((group) => group.entrantIds.map((entrantId, index) => ({ groupId: group.id, entrantId, seed: index + 1 })));
    if (members.length > 0) await tx.insert(tournamentGroupEntrants).values(members);
  }
  await insertMatches(tx, { tournamentId: input.tournamentId, matches });
}
