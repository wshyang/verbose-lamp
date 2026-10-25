import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completeMatch, completeStage, occupantsOf, scoreStep, stageAdvancers, startMatch, type Actor, type StageOverride } from '@psd/tournament/core';
import { defaultPipelineSpec, type PipelineSpec } from '@psd/tournament/scheduler';
import { newId } from '../db/ids.js';
import {
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
import { inArray } from 'drizzle-orm';
import { runCommand } from '../tournament/commands.js';
import { findOpenTournament, loadState } from '../tournament/load.js';
import { applyContingency } from '../tournament-scheduler/control.js';
import { restageStage } from '../tournament-scheduler/restage.js';
import { reconcile } from '../tournament-scheduler/planning.js';
import { activate, advanceStages, findScheduler } from '../tournament-scheduler/scheduler.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, type TestContext } from './harness.js';

/**
 * ADR-310 — the stage pipeline against a real database: nine teams, three groups
 * at 15 minutes, then the top four cross-seeded into 20-minute semis and a final.
 * The tournament's own length (12) is deliberately neither, so a stage keeping
 * its duration is visible in the rows.
 */

let ctx: TestContext;
let desk: Actor;
let marshal: Actor;
const START = new Date('2026-10-15T01:00:00.000Z');
const courtIds = [newId(), newId(), newId()];
const TIMING = { matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0, deadlineAt: null };

async function enterTeams(count: number): Promise<string[]> {
  const teamIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const captain = await ctx.signUpParticipant();
    teamIds.push(await createTeam(ctx, captain, teamNameFor(ctx.runId)));
  }
  return teamIds;
}

async function openTournament(input: { name: string; teamIds: readonly string[] }): Promise<string> {
  const id = newId();
  await ctx.handle.db.insert(tournaments).values({
    id,
    name: input.name,
    status: 'draft',
    winPoints: 30,
    drawPoints: 20,
    lossPoints: 10,
    createdByKind: 'superadmin',
    createdById: desk.id,
    createdByLabel: desk.label,
  });
  await ctx.handle.db.insert(tournamentEntrants).values(
    input.teamIds.map((teamId, index) => ({ id: newId(), tournamentId: id, teamId, nameSnapshot: `Team ${index + 1}`, entryOrder: index + 1 })),
  );
  return id;
}

async function closeOpen(): Promise<void> {
  const open = await findOpenTournament(ctx.handle.db);
  if (open !== null) await ctx.handle.db.update(tournaments).set({ status: 'closed', closedAt: START }).where(eq(tournaments.id, open.id));
}

async function matchesOf(tournamentId: string) {
  return ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId)).orderBy(asc(tournamentMatches.sequence));
}

async function stagesOf(tournamentId: string) {
  return ctx.handle.db.select().from(tournamentStages).where(eq(tournamentStages.tournamentId, tournamentId)).orderBy(asc(tournamentStages.ordinal));
}

async function entrantIdsOf(tournamentId: string): Promise<string[]> {
  const rows = await ctx.handle.db
    .select()
    .from(tournamentEntrants)
    .where(eq(tournamentEntrants.tournamentId, tournamentId))
    .orderBy(asc(tournamentEntrants.entryOrder));
  return rows.map((row) => row.id);
}

/** Plays a match to the given score, the way a marshal would. */
async function playScore(input: { matchId: string; courtId: string; scoreA: number; scoreB: number }): Promise<void> {
  const { matchId } = input;
  const run = (command: Parameters<typeof runCommand>[1]['command']) =>
    runCommand(ctx.handle.db, { actor: marshal, now: START, command });
  expect((await run((state, context) => startMatch(state, { matchId, courtId: input.courtId }, context))).ok).toBe(true);
  for (let point = 0; point < input.scoreA; point += 1) {
    await run((state, context) => scoreStep(state, { matchId, side: 'a', from: point, to: point + 1 }, context));
  }
  for (let point = 0; point < input.scoreB; point += 1) {
    await run((state, context) => scoreStep(state, { matchId, side: 'b', from: point, to: point + 1 }, context));
  }
  expect((await run((state, context) => completeMatch(state, { matchId, namedWinner: null }, context))).ok).toBe(true);
}

beforeAll(async () => {
  ctx = await createTestContext();
  const superadmin = await ctx.signInSuperadmin();
  const facilitator = await ctx.createFacilitator();
  desk = { kind: 'superadmin', id: superadmin.id, label: 'superadmin' };
  marshal = { kind: 'facilitator', id: facilitator.id, label: 'court1' };
  await ctx.handle.db.insert(tournamentCourts).values(courtIds.map((id, index) => ({ id, courtNumber: index + 1, label: `Court ${index + 1}` })));
});

afterAll(async () => {
  await ctx.close();
});

describe('the nine-team pipeline day', () => {
  let tournamentId = '';

  it('activates the template: stages, groups and per-stage durations in the rows', async () => {
    tournamentId = await openTournament({ name: 'Pipeline day', teamIds: await enterTeams(9) });
    const outcome = await activate(ctx.handle.db, { tournamentId, pipeline: defaultPipelineSpec(), ...TIMING, now: START });
    expect(outcome).toEqual({ ok: true });
    expect((await findScheduler(ctx.handle.db, tournamentId))?.format).toBe('pipeline');
    expect((await stagesOf(tournamentId)).map((stage) => [stage.code, stage.status])).toEqual([
      ['GRP', 'active'],
      ['KO', 'pending'],
    ]);
    const matches = await matchesOf(tournamentId);
    expect(matches).toHaveLength(12);
    // The tournament's 12 was neither stage's choice, and neither stage took it.
    expect(matches.filter((m) => m.stageId !== null).every((m) => m.plannedMinutes !== 12)).toBe(true);
    const stages = await stagesOf(tournamentId);
    const byStage = new Map(stages.map((stage) => [stage.id, stage.code]));
    expect(matches.filter((m) => byStage.get(m.stageId ?? '') === 'GRP').map((m) => m.plannedMinutes)).toEqual(Array(9).fill(15));
    expect(matches.filter((m) => byStage.get(m.stageId ?? '') === 'KO').map((m) => m.plannedMinutes)).toEqual(Array(3).fill(20));
    await reconcile(ctx.handle.db, START);
    const planned = await matchesOf(tournamentId);
    expect(planned.filter((m) => byStage.get(m.stageId ?? '') === 'GRP').every((m) => m.courtId !== null)).toBe(true);
  });

  it('plays the groups and seats 1v4 / 2v3 with the best runner-up fourth', async () => {
    const tournament = await findOpenTournament(ctx.handle.db);
    if (tournament === null) throw new Error('no open tournament');
    const state = await loadState(ctx.handle.db, tournament);
    const seeds = await entrantIdsOf(tournamentId);
    // Winners level on points, difference and scored fall to entry order (e1, e2, e3);
    // the runners-up are separated by the second-listed team's margin over the third:
    // group B's (5) beats C's (2) beats A's (1), so seed 5 is the best runner-up.
    const runnerUpMargin: Record<string, number> = { A: 1, B: 5, C: 2 };
    for (const group of state.groups) {
      const [first, second, third] = group.entrantIds as [string, string, string];
      const margins = new Map<string, number>([
        [`${first}>${second}`, 5],
        [`${first}>${third}`, 5],
        [`${second}>${third}`, runnerUpMargin[group.code] ?? 1],
      ]);
      const own = state.matches.filter((m) => m.groupId === group.id);
      for (const row of own) {
        const seated = occupantsOf(state, row);
        const a = seated.a;
        const b = seated.b;
        if (a === null || b === null || row.courtId === null) throw new Error('group match not seated and planned');
        const margin = margins.get(`${a}>${b}`) ?? margins.get(`${b}>${a}`) ?? 0;
        await playScore({ matchId: row.id, courtId: row.courtId, scoreA: margins.has(`${a}>${b}`) ? margin : 0, scoreB: margins.has(`${b}>${a}`) ? margin : 0 });
      }
    }
    await advanceStages(ctx.handle.db, START);
    await reconcile(ctx.handle.db, START);
    expect((await stagesOf(tournamentId)).map((stage) => [stage.code, stage.status])).toEqual([
      ['GRP', 'completed'],
      ['KO', 'active'],
    ]);
    const after = await loadState(ctx.handle.db, tournament);
    const codeOf = new Map((await stagesOf(tournamentId)).map((stage) => [stage.id, stage.code]));
    const semis = after.matches
      .filter((m) => codeOf.get(m.stageId) === 'KO' && m.round === 1)
      .sort((left, right) => left.sequence - right.sequence);
    expect(semis.map((m) => { const seated = occupantsOf(after, m); return [seated.a, seated.b]; })).toEqual([
      [seeds[0], seeds[4]],
      [seeds[1], seeds[2]],
    ]);
  });

  it('finishes the knockouts and closes the last stage', async () => {
    const tournament = await findOpenTournament(ctx.handle.db);
    if (tournament === null) throw new Error('no open tournament');
    const state = await loadState(ctx.handle.db, tournament);
    const codeOf = new Map((await stagesOf(tournamentId)).map((stage) => [stage.id, stage.code]));
    const knockouts = state.matches
      .filter((m) => codeOf.get(m.stageId) === 'KO')
      .sort((left, right) => left.sequence - right.sequence);
    for (const row of knockouts) {
      if (row.courtId === null) throw new Error('knockout not planned');
      await playScore({ matchId: row.id, courtId: row.courtId, scoreA: 3, scoreB: 1 });
    }
    await advanceStages(ctx.handle.db, START);
    expect((await stagesOf(tournamentId)).map((stage) => stage.status)).toEqual(['completed', 'completed']);
  });
});

/**
 * ADR-325 — a pool fed by an earlier stage, and an open stage fed by one, against a real database.
 * Nine teams in three groups of three, the top six into two second-round pools of three.
 */
describe('a pool fed by an earlier stage (ADR-325)', () => {
  const spec: PipelineSpec = {
    stages: [
      { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 2 } },
      { code: 'P2', label: 'Second pools', format: 'pool', source: { kind: 'advancers', fromStage: 'GRP', count: 6 }, matchMinutes: 15, options: { groupCount: 2 } },
    ],
  };
  let tournamentId = '';

  it('activates with the second pool dealt as SEATS: its groups exist and have no members yet', async () => {
    await closeOpen();
    tournamentId = await openTournament({ name: 'Fed pool day', teamIds: await enterTeams(9) });
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: spec, ...TIMING, now: START })).toEqual({ ok: true });
    const stages = await stagesOf(tournamentId);
    const second = stages.find((stage) => stage.code === 'P2');
    const first = stages.find((stage) => stage.code === 'GRP');
    expect(second?.intakeStageId).toBe(first?.id);
    expect(second?.intakeCount).toBe(6);
    expect(first?.intakeStageId).toBeNull();
    const groups = await ctx.handle.db.select().from(tournamentGroups).where(inArray(tournamentGroups.stageId, stages.map((row) => row.id)));
    const secondGroups = groups.filter((group) => group.stageId === second?.id);
    expect(secondGroups).toHaveLength(2);
    const members = await ctx.handle.db.select().from(tournamentGroupEntrants).where(inArray(tournamentGroupEntrants.groupId, secondGroups.map((group) => group.id)));
    expect(members).toHaveLength(0);
    // Six round-robin fixtures in the second pools, every seat a PLACE in the first stage.
    const fixtures = (await matchesOf(tournamentId)).filter((match) => match.stageId === second?.id);
    expect(fixtures).toHaveLength(6);
    const slots = await ctx.handle.db.select().from(tournamentSlots).where(inArray(tournamentSlots.matchId, fixtures.map((match) => match.id)));
    expect(slots.every((slot) => slot.sourceKind === 'stage_place' && slot.sourceStageId === first?.id)).toBe(true);
  });

  it('fills the second pools with the people in those seats when the first stage closes, and keeps it across a reload', async () => {
    const tournament = await findOpenTournament(ctx.handle.db);
    if (tournament === null) throw new Error('no open tournament');
    await playStage(tournament, 'GRP');
    await closeAsDesk(tournament, 'GRP');
    await reconcile(ctx.handle.db, START);

    const stages = await stagesOf(tournamentId);
    expect(stages.map((stage) => [stage.code, stage.status])).toEqual([['GRP', 'completed'], ['P2', 'active']]);
    const second = stages.find((stage) => stage.code === 'P2');
    const rows = await ctx.handle.db
      .select()
      .from(tournamentGroupEntrants)
      .where(inArray(tournamentGroupEntrants.groupId, (await ctx.handle.db.select().from(tournamentGroups).where(eq(tournamentGroups.stageId, second?.id ?? ''))).map((group) => group.id)));
    // Six distinct teams, three per group, none of them one of the three eliminated.
    expect(new Set(rows.map((row) => row.entrantId)).size).toBe(6);
    const reloaded = await loadState(ctx.handle.db, tournament);
    const reloadedGroups = reloaded.groups.filter((group) => group.stageId === second?.id);
    expect(reloadedGroups.map((group) => group.entrantIds.length)).toEqual([3, 3]);
    // And the fixtures are seated by real teams, so the second round can start the moment this one ends.
    const fixtures = reloaded.matches.filter((match) => match.stageId === second?.id);
    for (const fixture of fixtures) {
      const seated = occupantsOf(reloaded, fixture);
      expect(seated.a).not.toBeNull();
      expect(seated.b).not.toBeNull();
    }
  });
});

describe('an open stage fed by an earlier stage (ADR-325)', () => {
  const spec: PipelineSpec = {
    stages: [
      { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 1 } },
      { code: 'FUN', label: 'Open play', format: 'open', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 10 },
    ],
  };

  it('freezes a roster of the four who came through, and persists it', async () => {
    await closeOpen();
    const tournamentId = await openTournament({ name: 'Fed open day', teamIds: await enterTeams(9) });
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: spec, ...TIMING, now: START })).toEqual({ ok: true });
    const tournament = await findOpenTournament(ctx.handle.db);
    if (tournament === null) throw new Error('no open tournament');
    await playStage(tournament, 'GRP');
    // ADR-329 F2 — the desk names who takes place 1 by place; the open stage has no seats to name.
    const before = await loadState(ctx.handle.db, tournament);
    const groupStage = before.stages.find((stage) => stage.label === 'Groups');
    if (groupStage === undefined) throw new Error('no group stage');
    const through = stageAdvancers(before, groupStage, 4).map((advancer) => advancer.row.entrantId);
    const replacement = before.entrants.find((entrant) => !through.includes(entrant.id))?.id;
    if (replacement === undefined) throw new Error('no entrant outside the four');
    await closeAsDesk(tournament, 'GRP', [{ place: 1, entrantId: replacement }]);
    const stages = await stagesOf(tournamentId);
    const open = stages.find((stage) => stage.code === 'FUN');
    const roster = await ctx.handle.db.select().from(tournamentStageEntrants).where(eq(tournamentStageEntrants.stageId, open?.id ?? ''));
    expect(roster).toHaveLength(4);
    expect(roster.map((row) => row.place).sort()).toEqual([1, 2, 3, 4]);
    expect(roster.find((row) => row.place === 1)?.entrantId).toBe(replacement);
    const reloaded = await loadState(ctx.handle.db, tournament);
    expect(reloaded.stages.find((stage) => stage.id === open?.id)?.roster).toHaveLength(4);
    expect(reloaded.stages.find((stage) => stage.id === open?.id)?.intake).toMatchObject({ count: 4 });
  });
});

/**
 * Closes a stage the way the desk does. The scheduler closes one by itself only when no tie straddles
 * a cut (ADR-282) and these results are level on purpose, so the close is a person's call. Needing
 * the desk here is the existing rule, not something this change introduced.
 */
async function closeAsDesk(
  tournament: NonNullable<Awaited<ReturnType<typeof findOpenTournament>>>,
  code: string,
  overrides: readonly StageOverride[] = [],
): Promise<void> {
  const stage = (await stagesOf(tournament.id)).find((row) => row.code === code);
  if (stage === undefined) throw new Error(`no stage ${code}`);
  if (stage.status === 'completed') return;
  const outcome = await runCommand(ctx.handle.db, {
    actor: desk,
    now: START,
    command: (state, context) =>
      completeStage(state, { stageId: stage.id, overrides, reason: overrides.length > 0 ? 'The desk overruled the table.' : null }, context),
  });
  if (!outcome.ok) throw new Error(`desk close refused: ${JSON.stringify(outcome)}`);
}

/** Plays every scheduled match of one stage, 3-1 to side A, in sequence. */
async function playStage(tournament: NonNullable<Awaited<ReturnType<typeof findOpenTournament>>>, code: string): Promise<void> {
  const stage = (await stagesOf(tournament.id)).find((row) => row.code === code);
  await reconcile(ctx.handle.db, START);
  const planned = (await matchesOf(tournament.id)).filter((row) => row.stageId === stage?.id && row.status === 'scheduled');
  for (const row of planned) {
    if (row.courtId === null) throw new Error('match not planned onto a court');
    await playScore({ matchId: row.id, courtId: row.courtId, scoreA: 3, scoreB: row.sequence % 2 === 0 ? 1 : 2 });
  }
}

describe('pipeline activation refusals', () => {
  it('refuses advancers from a stage that is not earlier, and format-plus-pipeline', async () => {
    await closeOpen();
    const tournamentId = await openTournament({ name: 'Refusals', teamIds: await enterTeams(4) });
    const later: PipelineSpec = {
      stages: [
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 2 }, matchMinutes: 20 },
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15 },
      ],
    };
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: later, ...TIMING, now: START })).toEqual({
      ok: false,
      error: expect.stringMatching(/earlier stage/i),
    });
    expect(
      await activate(ctx.handle.db, { tournamentId, pipeline: defaultPipelineSpec(), formatId: 'round_robin', ...TIMING, now: START }),
    ).toEqual({ ok: false, error: expect.stringMatching(/not both/i) });
  });

  it('refuses activation when the successive stage would leave out a pool qualifier (ADR-328)', async () => {
    await closeOpen();
    const tournamentId = await openTournament({ name: 'Qualifier floor', teamIds: await enterTeams(9) });
    const short: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 1 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 2 }, matchMinutes: 20 },
      ],
    };
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: short, ...TIMING, now: START })).toEqual({
      ok: false,
      error: expect.stringMatching(/3 qualifiers \(3 groups × 1 per group\).*only 2/),
    });
  });
});

describe('internal table points and the reconciled handover (ADR-320)', () => {
  it('persists a stage’s table points apart from its paid rates, and reads them back', async () => {
    await closeOpen();
    const tournamentId = await openTournament({ name: 'Table points day', teamIds: await enterTeams(9) });
    const spec: PipelineSpec = {
      stages: [
        {
          code: 'GRP',
          label: 'Groups',
          format: 'pool',
          source: { kind: 'initial' },
          matchMinutes: 15,
          options: { groupSize: 3, advanceCount: 1, rates: { win: 10, draw: 5, loss: 0 }, tablePoints: { win: 2, draw: 1, loss: 0 } },
        },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 20 },
      ],
    };
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: spec, ...TIMING, now: START })).toEqual({ ok: true });
    const [grp, ko] = await stagesOf(tournamentId);
    // Paid rates and internal table points are separate columns, on purpose.
    expect(grp).toMatchObject({ winPoints: 10, drawPoints: 5, lossPoints: 0, tableWinPoints: 2, tableDrawPoints: 1, tableLossPoints: 0 });
    expect(ko).toMatchObject({ winPoints: null, tableWinPoints: null });
    const tournament = await findOpenTournament(ctx.handle.db);
    if (tournament === null) throw new Error('no open tournament');
    const state = await loadState(ctx.handle.db, tournament);
    expect(state.stages.find((stage) => stage.id === grp?.id)?.tablePoints).toEqual({ win: 2, draw: 1, loss: 0 });
    expect(state.stages.find((stage) => stage.id === grp?.id)?.rates).toEqual({ win: 10, draw: 5, loss: 0 });
    expect(state.stages.find((stage) => stage.id === ko?.id)?.tablePoints).toBeNull();
  });

  it('refuses an intake beyond the field the feeder ranks', async () => {
    await closeOpen();
    const tournamentId = await openTournament({ name: 'Too many fills', teamIds: await enterTeams(9) });
    const chained: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 1 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 20 },
        { code: 'FIN', label: 'Finals', format: 'bracket', source: { kind: 'advancers', fromStage: 'KO', count: 6 }, matchMinutes: 20 },
      ],
    };
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: chained, ...TIMING, now: START })).toEqual({
      ok: false,
      error: expect.stringMatching(/KO only has 4 teams to send on/),
    });
  });
});

describe('durations under contingency', () => {
  it('a stage named in the change retimes to its length, under a retime event (ADR-329 F13)', async () => {
    await closeOpen();
    const tournamentId = await openTournament({ name: 'Contingency', teamIds: await enterTeams(9) });
    const spec = defaultPipelineSpec();
    const inheriting: PipelineSpec = {
      stages: spec.stages.map((stage) => (stage.code === 'GRP' ? { ...stage, matchMinutes: null } : stage)),
    };
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: inheriting, ...TIMING, now: START })).toEqual({ ok: true });
    await reconcile(ctx.handle.db, START);
    const stages = await stagesOf(tournamentId);
    const byStage = new Map(stages.map((stage) => [stage.id, stage.code]));
    const lengths = async () => {
      const matches = await matchesOf(tournamentId);
      return {
        grp: matches.filter((m) => byStage.get(m.stageId ?? '') === 'GRP')[0]?.plannedMinutes,
        ko: matches.filter((m) => byStage.get(m.stageId ?? '') === 'KO')[0]?.plannedMinutes,
      };
    };
    // GRP inherited the tournament's 12; KO carries its own 20.
    expect(await lengths()).toEqual({ grp: 12, ko: 20 });
    const stageIdOf = (code: string) => stages.find((stage) => stage.code === code)?.id ?? '';
    const deadlineAt = new Date(START.getTime() + 8 * 60 * 60_000);
    const preview = await applyContingency(ctx.handle.db, {
      enabledCourtIds: courtIds,
      matchMinutes: 18,
      changeoverMinutes: 3,
      stageMinutes: [
        { stageId: stageIdOf('GRP'), matchMinutes: 18 },
        { stageId: stageIdOf('KO'), matchMinutes: 20 },
      ],
      restMinutes: 5,
      deadlineAt,
      now: START,
    });
    expect(preview.ok).toBe(true);
    expect(await lengths()).toEqual({ grp: 18, ko: 20 });
    expect((await findScheduler(ctx.handle.db, tournamentId))).toMatchObject({ matchMinutes: 18, restMinutes: 5, deadlineAt });
    // The retime is an attributable core act, not a silent rewrite of match rows.
    const retimedEvents = await ctx.handle.db.select().from(tournamentEvents).where(eq(tournamentEvents.kind, 'matches_retimed'));
    expect(retimedEvents.length).toBeGreaterThan(0);
  });
});

describe('restaging an unstarted stage (ADR-334)', () => {
  const spec: PipelineSpec = {
    stages: [
      { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 10, options: { groupSize: 2, advanceCount: 1 } },
      { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 3 }, matchMinutes: 10, options: {} },
    ],
  };
  let tournamentId = '';
  let grpStageId = '';

  it('rebuilds the group stage from pairs to triples and keeps the replaced rows as history', async () => {
    await closeOpen();
    tournamentId = await openTournament({ name: 'Restage day', teamIds: await enterTeams(6) });
    expect(await activate(ctx.handle.db, { tournamentId, pipeline: spec, ...TIMING, now: START })).toEqual({ ok: true });
    const stages = await stagesOf(tournamentId);
    grpStageId = (stages.find((stage) => stage.code === 'GRP') as { id: string }).id;
    expect((await ctx.handle.db.select().from(tournamentGroups).where(eq(tournamentGroups.stageId, grpStageId))).length).toBe(3);
    const outcome = await restageStage(ctx.handle.db, {
      tournamentId,
      stageId: grpStageId,
      patch: { groupSize: 3, matchMinutes: 8, reason: 'The hall lost a court; bigger groups, shorter games.' },
      actor: desk,
    });
    expect(outcome).toEqual({ ok: true });
    // Two groups of three now; every replaced group is superseded, never deleted.
    const groups = await ctx.handle.db.select().from(tournamentGroups).where(eq(tournamentGroups.stageId, grpStageId));
    expect(groups).toHaveLength(5);
    expect(groups.filter((group) => group.supersededAt === null)).toHaveLength(2);
    // Fixtures whose code survives keep their identity; the ones whose code vanished are
    // superseded rows, never deleted. The live ones are two round robins of three at the new length.
    const matches = await matchesOf(tournamentId);
    expect(matches.filter((match) => match.status === 'superseded').length).toBeGreaterThanOrEqual(1);
    const liveGrp = matches.filter((match) => match.stageId === grpStageId && match.status === 'scheduled');
    expect(liveGrp).toHaveLength(6);
    expect(liveGrp.every((match) => match.plannedMinutes === 8)).toBe(true);
    // The stored plan carries the new shape, and the rebuild is one attributable event.
    const scheduler = await findScheduler(ctx.handle.db, tournamentId);
    expect((scheduler?.pipelineSpec as PipelineSpec | null)?.stages[0]?.options?.groupSize).toBe(3);
    const events = await ctx.handle.db.select().from(tournamentEvents).where(eq(tournamentEvents.kind, 'stage_restructured'));
    expect(events.length).toBe(1);
    // The loaded state shows the new shape only.
    const tournament = await findOpenTournament(ctx.handle.db);
    const state = await loadState(ctx.handle.db, tournament as NonNullable<typeof tournament>);
    expect(state.groups).toHaveLength(2);
    expect(state.matches.filter((match) => match.stageId === grpStageId)).toHaveLength(6);
    expect(state.matches.some((match) => match.status === 'superseded')).toBe(false);
  });

  it('refuses once a match in the stage has started', async () => {
    const tournament = await findOpenTournament(ctx.handle.db);
    const state = await loadState(ctx.handle.db, tournament as NonNullable<typeof tournament>);
    const match = state.matches.find((candidate) => candidate.stageId === grpStageId);
    if (match === undefined) throw new Error('no group match');
    expect(
      (await runCommand(ctx.handle.db, { actor: marshal, now: START, command: (core, context) => startMatch(core, { matchId: match.id, courtId: courtIds[0] as string }, context) })).ok,
    ).toBe(true);
    const outcome = await restageStage(ctx.handle.db, {
      tournamentId,
      stageId: grpStageId,
      patch: { groupSize: 2, reason: 'Back to pairs.' },
      actor: desk,
    });
    expect(outcome).toMatchObject({ ok: false, refusal: { code: 'stage_started' } });
    await closeOpen();
  });
});
