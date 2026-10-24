import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeTournament,
  completeMatch,
  scoreStep,
  setMatchVoided,
  startMatch,
  withdrawEntrant,
  type Actor,
  type Match,
  type Slot,
  type SlotSource,
  type Stage,
} from '@psd/tournament/core';
import { newId } from '../db/ids.js';
import {
  tournamentAwards,
  tournamentCourts,
  tournamentEntrants,
  tournamentEvents,
  tournamentMatches,
  tournamentSlots,
  tournamentStages,
  tournaments,
} from '../db/schema/index.js';
import { NO_TOURNAMENT, runCommand, type EngineCommand } from '../tournament/commands.js';
import { findOpenTournament, loadState } from '../tournament/load.js';
import { insertStructure } from '../tournament/persist.js';
import { createTestContext, seedTeamsReady, type TestContext } from './harness.js';

/**
 * ADR-275 — the core adapter against a real database: an engine command loaded from rows, decided by
 * the pure core and written back in one transaction. Every assertion reads the rows, not the return.
 */

let ctx: TestContext;
let facilitator: Actor;
let desk: Actor;
const ids = { tournament: newId(), stage: newId(), group: newId(), court: newId(), entrants: [newId(), newId(), newId()] };
const matchIds = { m1: newId(), m2: newId(), m3: newId(), m4: newId() };

function slot(source: SlotSource, label: string): Slot {
  return { source, label, seatedEntrantId: null, seatOverrideReason: null };
}

function scheduled(id: string, input: { code: string; sequence: number; a: Slot; b: Slot }): Match {
  return {
    id,
    code: input.code,
    stageId: ids.stage,
    groupId: null,
    round: 1,
    sequence: input.sequence,
    origin: 'structure',
    isPlacement: false,
    status: 'scheduled',
    courtId: null,
    plannedStartAt: null,
    plannedMinutes: 12,
    startedAt: null,
    endedAt: null,
    startedBy: null,
    scoreA: 0,
    scoreB: 0,
    result: null,
    isVoided: false,
    cancelReason: null,
    version: 0,
    slots: { a: input.a, b: input.b },
  };
}

/** One of every slot source, so the loader reads each kind back from its columns. */
function structureMatches(): Match[] {
  const [e1, e2] = ids.entrants as [string, string, string];
  return [
    scheduled(matchIds.m1, {
      code: 'M1',
      sequence: 1,
      a: slot({ kind: 'entrant', entrantId: e1 }, 'Reds'),
      b: slot({ kind: 'entrant', entrantId: e2 }, 'Blues'),
    }),
    scheduled(matchIds.m2, {
      code: 'M2',
      sequence: 2,
      a: slot({ kind: 'winner_of', matchId: matchIds.m1 }, 'Winner of M1'),
      b: slot({ kind: 'loser_of', matchId: matchIds.m1 }, 'Loser of M1'),
    }),
    scheduled(matchIds.m3, {
      code: 'M3',
      sequence: 3,
      a: slot({ kind: 'group_place', groupId: ids.group, place: 1 }, '1st in Group A'),
      b: slot({ kind: 'stage_place', stageId: ids.stage, place: 2 }, '#2 overall'),
    }),
    scheduled(matchIds.m4, {
      code: 'M4',
      sequence: 4,
      a: slot({ kind: 'pairing', stageId: ids.stage, round: 2, pairIndex: 0, side: 'a' }, 'Round 2 pairing'),
      b: slot({ kind: 'vacant' }, 'Bye'),
    }),
  ];
}

async function insertTournamentRows(input: { superadminId: string; teamIds: readonly string[] }): Promise<void> {
  const db = ctx.handle.db;
  await db.insert(tournaments).values({
    id: ids.tournament,
    name: 'Captain’s ball',
    status: 'live',
    winPoints: 30,
    drawPoints: 20,
    lossPoints: 10,
    createdByKind: 'superadmin',
    createdById: input.superadminId,
    createdByLabel: 'superadmin',
  });
  await db.insert(tournamentCourts).values({ id: ids.court, courtNumber: 1, label: 'Court 1' });
  await db.insert(tournamentEntrants).values(
    ids.entrants.map((id, index) => ({
      id,
      tournamentId: ids.tournament,
      teamId: input.teamIds[index] as string,
      nameSnapshot: `Team ${index + 1}`,
      entryOrder: index + 1,
    })),
  );
}

async function seedTournament(): Promise<void> {
  const teams = await seedTeamsReady(ctx);
  const third = await seedTeamsReady(ctx);
  await insertTournamentRows({ superadminId: teams.superadmin.id, teamIds: [teams.teamAId, teams.teamBId, third.teamAId] });
  const stage: Stage & { code: string } = {
    id: ids.stage,
    code: 'POOL',
    ordinal: 1,
    label: 'Pool',
    kind: 'pool',
    allowsDraws: true,
    advanceCount: 1,
    rates: null,
    tablePoints: null,
    intake: null,
    roster: [],
    status: 'pending',
  };
  const group = { id: ids.group, stageId: ids.stage, code: 'A', label: 'Group A', entrantIds: ids.entrants };
  await insertStructure(ctx.handle.db, { tournamentId: ids.tournament, structure: { stages: [stage], groups: [group], matches: structureMatches() } });
  facilitator = { kind: 'facilitator', id: teams.facilitator.id, label: 'court1' };
  desk = { kind: 'superadmin', id: teams.superadmin.id, label: 'superadmin' };
}

function run(actor: Actor, command: EngineCommand) {
  return runCommand(ctx.handle.db, { actor, now: new Date(), command });
}

async function matchRow(id: string) {
  const [row] = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
  return row;
}

async function revision(): Promise<number> {
  const [row] = await ctx.handle.db.select({ revision: tournaments.revision }).from(tournaments).where(eq(tournaments.id, ids.tournament));
  return row?.revision ?? -1;
}

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('runCommand — the core adapter, real database', () => {
  it('refuses when no tournament is open, and writes nothing', async () => {
    const outcome = await run({ kind: 'system', id: newId(), label: 'system' }, (state) => ({ ok: true, state, events: [] }));
    expect(outcome).toEqual({ ok: false, refusal: NO_TOURNAMENT });
  });

  it('loads every slot source back from its columns', async () => {
    await seedTournament();
    const row = await findOpenTournament(ctx.handle.db);
    if (row === null) throw new Error('no tournament');
    const state = await loadState(ctx.handle.db, row);
    expect(state.matches.map((match) => [match.slots.a.source.kind, match.slots.b.source.kind])).toEqual([
      ['entrant', 'entrant'],
      ['winner_of', 'loser_of'],
      ['group_place', 'stage_place'],
      ['pairing', 'vacant'],
    ]);
    expect(state.matches[3]?.slots.a.source).toEqual({ kind: 'pairing', stageId: ids.stage, round: 2, pairIndex: 0, side: 'a' });
    expect(state.groups[0]?.entrantIds).toEqual(ids.entrants);
    expect(state.stages[0]).toMatchObject({ kind: 'pool', status: 'pending', rates: null });
    expect(state.courts).toEqual([{ id: ids.court, label: 'Court 1', isEnabled: true }]);
  });

  it('starts a match: court taken, seats frozen, stage activated, revision bumped', async () => {
    const outcome = await run(facilitator, (state, context) => startMatch(state, { matchId: matchIds.m1, courtId: ids.court }, context));
    expect(outcome.ok).toBe(true);
    expect(await matchRow(matchIds.m1)).toMatchObject({ status: 'in_progress', courtId: ids.court, startedByLabel: 'court1', version: 1 });
    const seats = await ctx.handle.db
      .select()
      .from(tournamentSlots)
      .where(eq(tournamentSlots.matchId, matchIds.m1))
      .orderBy(asc(tournamentSlots.side));
    expect(seats.map((seat) => seat.seatedEntrantId)).toEqual([ids.entrants[0], ids.entrants[1]]);
    const [stageRow] = await ctx.handle.db.select().from(tournamentStages).where(eq(tournamentStages.id, ids.stage));
    expect(stageRow?.status).toBe('active');
    expect(await revision()).toBe(1);
  });

  it('scores and completes it, paying result awards to both seated entrants', async () => {
    expect((await run(facilitator, (state, context) => scoreStep(state, { matchId: matchIds.m1, side: 'a', from: 0, to: 1 }, context))).ok).toBe(true);
    expect((await run(facilitator, (state, context) => completeMatch(state, { matchId: matchIds.m1, namedWinner: null }, context))).ok).toBe(true);
    expect(await matchRow(matchIds.m1)).toMatchObject({ status: 'completed', scoreA: 1, resultKind: 'score', winnerSide: 'a' });
    const awards = await ctx.handle.db
      .select()
      .from(tournamentAwards)
      .where(eq(tournamentAwards.matchId, matchIds.m1))
      .orderBy(asc(tournamentAwards.points));
    expect(awards.map((award) => [award.entrantId, award.points, award.createdByLabel])).toEqual([
      [ids.entrants[1], 10, 'court1'],
      [ids.entrants[0], 30, 'court1'],
    ]);
    const events = await ctx.handle.db
      .select()
      .from(tournamentEvents)
      .where(eq(tournamentEvents.tournamentId, ids.tournament))
      .orderBy(asc(tournamentEvents.at));
    expect(events.map((event) => event.kind)).toEqual(['match_started', 'match_scored', 'match_completed']);
  });

  it('writes nothing for a refused command', async () => {
    const before = await revision();
    const outcome = await run(facilitator, (state, context) => scoreStep(state, { matchId: matchIds.m1, side: 'a', from: 1, to: 2 }, context));
    expect(outcome.ok).toBe(false);
    expect(await revision()).toBe(before);
  });

  it('voids the result awards with the match, withdraws a team and closes the day', async () => {
    expect((await run(desk, (state, context) => setMatchVoided(state, { matchId: matchIds.m1, isVoided: true, reason: 'wrong teams' }, context))).ok).toBe(true);
    const awards = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.matchId, matchIds.m1));
    expect(awards.every((award) => award.voidedAt !== null)).toBe(true);
    const withdrawal = (await run(desk, (state, context) => withdrawEntrant(state, { entrantId: ids.entrants[2] as string, reason: 'train home' }, context))).ok;
    expect(withdrawal).toBe(true);
    const [withdrawn] = await ctx.handle.db.select().from(tournamentEntrants).where(eq(tournamentEntrants.id, ids.entrants[2] as string));
    expect(withdrawn).toMatchObject({ withdrawReason: 'train home' });
    expect(withdrawn?.withdrawnAt).not.toBeNull();
    expect((await run(desk, (state, context) => closeTournament(state, { reason: 'rain' }, context))).ok).toBe(true);
    const [closed] = await ctx.handle.db.select().from(tournaments).where(eq(tournaments.id, ids.tournament));
    expect(closed).toMatchObject({ status: 'closed', closeReason: 'rain' });
    expect(closed?.closedAt).not.toBeNull();
    expect(await findOpenTournament(ctx.handle.db)).toBeNull();
  });
});
