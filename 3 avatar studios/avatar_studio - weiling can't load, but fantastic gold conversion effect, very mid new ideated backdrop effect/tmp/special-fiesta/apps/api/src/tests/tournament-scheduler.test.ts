import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completeMatch, scoreStep, startMatch, type Actor } from '@psd/tournament/core';
import { newId } from '../db/ids.js';
import {
  tournamentCourts,
  tournamentEntrants,
  tournamentEvents,
  tournamentMatches,
  tournamentSchedulerPins,
  tournamentStages,
  tournaments,
} from '../db/schema/index.js';
import { runCommand } from '../tournament/commands.js';
import { findOpenTournament, loadState } from '../tournament/load.js';
import { applyContingency, moveMatch, previewContingency, releasePin, terminate } from '../tournament-scheduler/control.js';
import { reconcile, toMinutes } from '../tournament-scheduler/planning.js';
import { activate, findScheduler } from '../tournament-scheduler/scheduler.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, type TestContext } from './harness.js';

/**
 * ADR-274/278 — the scheduler adapter against a real database: activation builds the format over the
 * entered teams, reconcile places the day on the enabled courts, contingency is previewed before it
 * is applied, a pin survives re-plans, and termination stops every move. Assertions read the rows.
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

/** Ends whatever tournament is open, so the next describe can open its own (one open at a time). */
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

/** Plays a match to a win for side a, by `margin` points, the way a marshal would. */
async function playWin(row: { id: string; courtId: string | null }, margin: number): Promise<void> {
  const courtId = row.courtId ?? courtIds[0] ?? '';
  const run = (command: Parameters<typeof runCommand>[1]['command']) => runCommand(ctx.handle.db, { actor: marshal, now: START, command });
  expect((await run((state, context) => startMatch(state, { matchId: row.id, courtId }, context))).ok).toBe(true);
  for (let point = 0; point < margin; point += 1) {
    await run((state, context) => scoreStep(state, { matchId: row.id, side: 'a', from: point, to: point + 1 }, context));
  }
  expect((await run((state, context) => completeMatch(state, { matchId: row.id, namedWinner: null }, context))).ok).toBe(true);
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

describe('activate and reconcile — a groups day on three courts', () => {
  let tournamentId = '';

  it('builds the format over the entered teams and starts the day', async () => {
    tournamentId = await openTournament({ name: 'Groups day', teamIds: await enterTeams(8) });
    const outcome = await activate(ctx.handle.db, { tournamentId, formatId: 'groups_knockout', options: { groupSize: 4, advanceCount: 2 }, ...TIMING, now: START });
    expect(outcome).toEqual({ ok: true });
    expect((await stagesOf(tournamentId)).map((stage) => [stage.code, stage.status])).toEqual([
      ['GRP', 'active'],
      ['KO', 'pending'],
    ]);
    // Two groups of four (six matches each), then semi-finals and a final.
    expect(await matchesOf(tournamentId)).toHaveLength(12 + 3);
    expect(await findScheduler(ctx.handle.db, tournamentId)).toMatchObject({ format: 'groups_knockout', status: 'active', revision: 0 });
    const [row] = await ctx.handle.db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
    expect(row).toMatchObject({ status: 'live', startedAt: START });
  });

  it('places every match on an enabled court, never two at once on one court', async () => {
    const changes = await reconcile(ctx.handle.db, START);
    expect(changes).toHaveLength(15);
    expect(changes.every((change) => change.kind === 'added')).toBe(true);
    const rows = await matchesOf(tournamentId);
    expect(rows.every((row) => row.courtId !== null && row.plannedStartAt !== null)).toBe(true);
    for (const courtId of courtIds) {
      const starts = rows
        .filter((row) => row.courtId === courtId)
        .map((row) => toMinutes(row.plannedStartAt ?? START))
        .sort((left, right) => left - right);
      starts.slice(1).forEach((start, index) => expect(start - (starts[index] ?? 0)).toBeGreaterThanOrEqual(15));
    }
    expect((await findScheduler(ctx.handle.db, tournamentId))?.revision).toBe(1);
    expect(await reconcile(ctx.handle.db, START)).toEqual([]);
  });

  it('previews a court going out in the rain without writing anything', async () => {
    const before = await matchesOf(tournamentId);
    const preview = await previewContingency(ctx.handle.db, { enabledCourtIds: courtIds.slice(0, 2), matchMinutes: 10, changeoverMinutes: 2, now: START });
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.changes.some((change) => change.kind === 'moved')).toBe(true);
    expect(preview.changes.every((change) => change.to?.courtId !== courtIds[2])).toBe(true);
    expect(preview.fit.remainingMatches).toBe(15);
    expect(await matchesOf(tournamentId)).toEqual(before);
  });

  it('applies it: the court is off, the matches re-timed, and nothing is left on the closed court', async () => {
    const applied = await applyContingency(ctx.handle.db, { enabledCourtIds: courtIds.slice(0, 2), matchMinutes: 10, changeoverMinutes: 2, now: START });
    expect(applied.ok).toBe(true);
    const [off] = await ctx.handle.db.select().from(tournamentCourts).where(eq(tournamentCourts.id, courtIds[2] ?? ''));
    expect(off?.isEnabled).toBe(false);
    const rows = await matchesOf(tournamentId);
    expect(rows.every((row) => row.plannedMinutes === 10 && row.courtId !== courtIds[2])).toBe(true);
    expect(await findScheduler(ctx.handle.db, tournamentId)).toMatchObject({ matchMinutes: 10, changeoverMinutes: 2 });
  });

  it('retimes one stage by name, and takes a new rest and hard stop (ADR-329 F13)', async () => {
    const stages = await stagesOf(tournamentId);
    const knockout = stages[stages.length - 1];
    const deadlineAt = new Date(START.getTime() + 9 * 60 * 60_000);
    const applied = await applyContingency(ctx.handle.db, {
      enabledCourtIds: courtIds.slice(0, 2),
      matchMinutes: 10,
      changeoverMinutes: 2,
      stageMinutes: [{ stageId: knockout?.id ?? '', matchMinutes: 7 }],
      restMinutes: 4,
      deadlineAt,
      now: START,
    });
    expect(applied.ok).toBe(true);
    const rows = await matchesOf(tournamentId);
    expect(rows.filter((row) => row.stageId === knockout?.id).every((row) => row.plannedMinutes === 7)).toBe(true);
    expect(rows.filter((row) => row.stageId !== knockout?.id).every((row) => row.plannedMinutes === 10)).toBe(true);
    expect(await findScheduler(ctx.handle.db, tournamentId)).toMatchObject({ restMinutes: 4, deadlineAt });
    const events = await ctx.handle.db.select().from(tournamentEvents).where(eq(tournamentEvents.kind, 'matches_retimed'));
    expect(events.length).toBeGreaterThan(0);
  });

  it('keeps a pinned match where a person put it, and lets it go when released', async () => {
    const rows = await matchesOf(tournamentId);
    const last = rows[rows.length - 1];
    if (last === undefined) throw new Error('no matches');
    const at = new Date(START.getTime() + 6 * 60 * 60_000);
    const moved = await moveMatch(ctx.handle.db, { actor: desk, matchId: last.id, courtId: courtIds[0] ?? '', start: at, now: START });
    expect(moved.ok).toBe(true);
    await reconcile(ctx.handle.db, START);
    const [pinned] = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, last.id));
    expect(pinned).toMatchObject({ courtId: courtIds[0], plannedStartAt: at });
    const pins = await ctx.handle.db.select().from(tournamentSchedulerPins).where(eq(tournamentSchedulerPins.matchId, last.id));
    expect(pins).toMatchObject([{ pinnedBy: 'superadmin', releasedAt: null }]);
    expect(await releasePin(ctx.handle.db, { matchId: last.id, now: START })).toBe(true);
    const [free] = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, last.id));
    expect(free?.plannedStartAt).not.toEqual(at);
    const live = await ctx.handle.db
      .select()
      .from(tournamentSchedulerPins)
      .where(and(eq(tournamentSchedulerPins.matchId, last.id), isNull(tournamentSchedulerPins.releasedAt)));
    expect(live).toEqual([]);
    expect(await releasePin(ctx.handle.db, { matchId: last.id, now: START })).toBe(false);
  });

  it('closes the group stage on its own once every group match is over, seating the knockout', async () => {
    const groupMatches = (await matchesOf(tournamentId)).filter((row) => row.groupId !== null);
    // Side a wins every match by its sequence number, so no two records tie on a cut line.
    for (const row of groupMatches) await playWin(row, row.sequence);
    await reconcile(ctx.handle.db, START);
    expect((await stagesOf(tournamentId)).map((stage) => stage.status)).toEqual(['completed', 'active']);
    const tournament = await findOpenTournament(ctx.handle.db);
    if (tournament === null) throw new Error('no tournament');
    const state = await loadState(ctx.handle.db, tournament);
    const semis = state.matches.filter((match) => match.groupId === null && match.round === 1);
    expect(semis).toHaveLength(2);
    expect(semis.every((match) => match.slots.a.seatedEntrantId !== null && match.slots.b.seatedEntrantId !== null)).toBe(true);
    const events = await ctx.handle.db.select().from(tournamentEvents).where(eq(tournamentEvents.kind, 'stage_completed'));
    expect(events).toMatchObject([{ actorKind: 'system', actorLabel: 'scheduler' }]);
  });

  it('stops for good when terminated: nothing re-plans, and a person still moves matches', async () => {
    expect(await terminate(ctx.handle.db, { reason: 'Lightning on the beach.', label: 'superadmin', now: START })).toEqual({ ok: true });
    expect(await findScheduler(ctx.handle.db, tournamentId)).toMatchObject({ status: 'terminated', terminateReason: 'Lightning on the beach.' });
    const before = await matchesOf(tournamentId);
    expect(await reconcile(ctx.handle.db, new Date(START.getTime() + 60 * 60_000))).toEqual([]);
    expect(await matchesOf(tournamentId)).toEqual(before);
    expect(await terminate(ctx.handle.db, { reason: 'again', label: 'superadmin', now: START })).toMatchObject({ ok: false });
    const preview = await previewContingency(ctx.handle.db, { enabledCourtIds: courtIds, matchMinutes: 10, changeoverMinutes: 2, now: START });
    expect(preview.ok).toBe(false);
    const target = before.find((row) => row.status === 'scheduled');
    if (target === undefined) throw new Error('nothing scheduled');
    const at = new Date(START.getTime() + 2 * 60 * 60_000);
    expect((await moveMatch(ctx.handle.db, { actor: desk, matchId: target.id, courtId: courtIds[1] ?? '', start: at, now: START })).ok).toBe(true);
    const [moved] = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, target.id));
    expect(moved).toMatchObject({ courtId: courtIds[1], plannedStartAt: at });
    // No scheduler to keep it from, so no pin is written.
    expect(await ctx.handle.db.select().from(tournamentSchedulerPins).where(eq(tournamentSchedulerPins.matchId, target.id))).toEqual([]);
    await closeOpen();
  });
});

describe('activate — the format with no plan, and the refusals', () => {
  it('starts open play with its scheduler already stopped', async () => {
    await ctx.handle.db.update(tournamentCourts).set({ isEnabled: true });
    const tournamentId = await openTournament({ name: 'Open play', teamIds: await enterTeams(4) });
    expect(await activate(ctx.handle.db, { tournamentId, formatId: 'open', options: {}, ...TIMING, now: START })).toEqual({ ok: true });
    expect(await findScheduler(ctx.handle.db, tournamentId)).toMatchObject({ format: 'open', status: 'terminated', terminatedByLabel: 'open play' });
    expect(await matchesOf(tournamentId)).toEqual([]);
    expect(await reconcile(ctx.handle.db, START)).toEqual([]);
    await closeOpen();
  });

  it('refuses an unknown format and a field the format cannot play, writing nothing', async () => {
    const tournamentId = await openTournament({ name: 'Too few', teamIds: await enterTeams(3) });
    expect(await activate(ctx.handle.db, { tournamentId, formatId: 'nope', options: {}, ...TIMING, now: START })).toEqual({ ok: false, error: 'Unknown format.' });
    expect((await activate(ctx.handle.db, { tournamentId, formatId: 'consolation', options: {}, ...TIMING, now: START })).ok).toBe(false);
    expect(await findScheduler(ctx.handle.db, tournamentId)).toBeNull();
    expect(await stagesOf(tournamentId)).toEqual([]);
    await closeOpen();
  });
});

describe('Swiss — a round at a time, with every bye recorded', () => {
  it('credits round one’s sit-out, pairs round two once round one is over, and credits its sit-out too', async () => {
    const tournamentId = await openTournament({ name: 'Swiss day', teamIds: await enterTeams(5) });
    expect(await activate(ctx.handle.db, { tournamentId, formatId: 'swiss', options: { rounds: 3 }, ...TIMING, now: START })).toEqual({ ok: true });
    await reconcile(ctx.handle.db, START);
    const roundOne = (await matchesOf(tournamentId)).filter((row) => row.round === 1);
    // Five teams: seeds 1 v 2 and 3 v 4, and the fifth seed's bye, owed and now recorded.
    expect(roundOne.map((row) => [row.status, row.resultKind])).toEqual([
      ['scheduled', null],
      ['scheduled', null],
      ['completed', 'bye'],
    ]);
    for (const row of roundOne.filter((candidate) => candidate.status === 'scheduled')) await playWin(row, 1);
    await reconcile(ctx.handle.db, START);
    const roundTwo = (await matchesOf(tournamentId)).filter((row) => row.round === 2);
    const toPlay = roundTwo.filter((row) => row.status === 'scheduled');
    expect(toPlay).toHaveLength(2);
    expect(toPlay.every((row) => row.courtId !== null)).toBe(true);
    expect(roundTwo.filter((row) => row.resultKind === 'bye')).toHaveLength(1);
    const kinds = (await ctx.handle.db.select().from(tournamentEvents).where(eq(tournamentEvents.tournamentId, tournamentId))).map((event) => event.kind);
    expect(kinds.filter((kind) => kind === 'round_paired')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'bye_recorded')).toHaveLength(2);
    // Round two is still open: another re-plan pairs nothing more.
    await reconcile(ctx.handle.db, START);
    expect((await matchesOf(tournamentId)).filter((row) => row.round === 3)).toEqual([]);
    await closeOpen();
  });

  it('stops pairing after the last round, with the rounds read from the field when none were chosen', async () => {
    const tournamentId = await openTournament({ name: 'Short Swiss', teamIds: await enterTeams(4) });
    // Four teams and no rounds option: ⌈log₂ 4⌉ = 2 rounds.
    expect(await activate(ctx.handle.db, { tournamentId, formatId: 'swiss', options: {}, ...TIMING, now: START })).toEqual({ ok: true });
    await reconcile(ctx.handle.db, START);
    for (const round of [1, 2]) {
      for (const row of (await matchesOf(tournamentId)).filter((match) => match.round === round && match.status === 'scheduled')) await playWin(row, 1);
      await reconcile(ctx.handle.db, START);
    }
    const rounds = new Set((await matchesOf(tournamentId)).map((row) => row.round));
    expect([...rounds].sort()).toEqual([1, 2]);
    await closeOpen();
  });
});
