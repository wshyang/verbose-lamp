import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView, ContingencyPreviewView, TimetableView, TournamentEventView } from '@psd/contracts';
import { messages } from '@psd/contracts';
import {
  tournamentAwards,
  tournamentCourts,
  tournamentEvents,
  tournamentMatches,
  tournamentSchedulerPins,
  tournamentSchedulers,
  tournaments,
} from '../db/schema/index.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, withMethod, type ActorSession, type TestContext } from './harness.js';

/**
 * ADR-279 — the superadmin's tournament console, driven over HTTP the way the Control subtab drives
 * it: courts, a draft, Start, a correction, a walkover, an award, contingency previewed then applied,
 * a move, the scheduler stopped, the day closed. Every write is read back from the rows.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
const teamIds: string[] = [];

type Console = AdminTournamentConsoleView;

interface Call {
  path: string;
  body?: unknown;
  session?: ActorSession;
  method?: 'PUT' | 'PATCH';
}

async function call<T>(input: Call) {
  const headers = (input.session ?? desk).headers;
  const init =
    input.body === undefined
      ? { headers }
      : input.method === undefined
        ? jsonRequest(input.body, headers)
        : withMethod(input.method, input.body, headers);
  const response = await ctx.app.request(`/api/admin/tournament${input.path}`, init);
  return { status: response.status, body: (await response.json()) as T };
}

async function consoleNow(): Promise<Console> {
  return (await call<Console>({ path: '' })).body;
}

async function matchRow(id: string) {
  const [row] = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
  return row;
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  for (let index = 0; index < 4; index += 1) teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
});

afterAll(async () => {
  await ctx.close();
});

describe('the venue — courts', () => {
  it('adds courts, refuses a number already taken, renames one and switches one off and on', async () => {
    expect((await call<Console>({ path: '/courts', body: { courtNumber: 1, label: 'Court 1' } })).status).toBe(201);
    const second = await call<Console>({ path: '/courts', body: { courtNumber: 2, label: 'Court 2' } });
    expect(second.body.courts.map((court) => court.label)).toEqual(['Court 1', 'Court 2']);
    const taken = await call<{ error: { message: string } }>({ path: '/courts', body: { courtNumber: 2, label: 'Again' } });
    expect(taken.status).toBe(409);
    expect(taken.body.error.message).toBe(messages.courtNumberTaken);
    const id = second.body.courts[1]?.id ?? '';
    await call<Console>({ path: `/courts/${id}`, body: { courtNumber: 2, label: 'Beach 2' }, method: 'PUT' });
    await call<Console>({ path: `/courts/${id}/enabled`, body: { isEnabled: false }, method: 'PATCH' });
    const [row] = await ctx.handle.db.select().from(tournamentCourts).where(eq(tournamentCourts.id, id));
    expect(row).toMatchObject({ label: 'Beach 2', isEnabled: false });
    await call<Console>({ path: `/courts/${id}/enabled`, body: { isEnabled: true }, method: 'PATCH' });
  });
});

describe('setup — a draft, then Start', () => {
  it('lists the teams it can enter, creates a draft in seed order, and refuses a second one', async () => {
    const before = await consoleNow();
    expect(before.tournament).toBeNull();
    expect(before.teams.map((team) => team.id).sort()).toEqual([...teamIds].sort());
    const created = await call<Console>({ path: '', body: { name: 'Captain’s ball', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds } });
    expect(created.status).toBe(201);
    expect(created.body.tournament).toMatchObject({ status: 'draft', rates: { win: 30, draw: 20, loss: 10 } });
    expect(created.body.tournament?.entrants.map((entrant) => entrant.teamId)).toEqual(teamIds);
    const again = await call<{ error: { message: string } }>({ path: '', body: { name: 'Two', winPoints: 1, drawPoints: 1, lossPoints: 1, teamIds } });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe(messages.tournamentAlreadyOpen);
  });

  it('refuses a format the field cannot play, then starts a round robin, then refuses a second Start', async () => {
    const timing = { matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 };
    expect((await call<unknown>({ path: '/activate', body: { formatId: 'consolation', ...timing } })).status).toBe(400);
    const started = await call<Console>({ path: '/activate', body: { formatId: 'round_robin', ...timing } });
    expect(started.status).toBe(200);
    const day = started.body.tournament;
    expect(day).toMatchObject({ status: 'live', scheduler: { format: 'round_robin', status: 'active', matchMinutes: 12 } });
    expect(day?.matches).toHaveLength(6);
    expect(day?.matches.every((match) => match.courtLabel !== null && match.plannedStartAt !== null)).toBe(true);
    expect(day?.fit).toMatchObject({ remainingMatches: 6 });
    const restart = await call<{ error: { message: string } }>({ path: '/activate', body: { formatId: 'round_robin', ...timing } });
    expect(restart.status).toBe(409);
    expect(restart.body.error.message).toBe(messages.tournamentNotDraft);
  });

  it('restages the untouched round robin to a new match length (ADR-334)', async () => {
    const stage = (await call<Console>({ path: '' })).body.tournament?.stages[0];
    const restaged = await call<Console>({
      path: `/stages/${stage?.id}/restructure`,
      body: { matchMinutes: 9, reason: 'The hall opens late; shorter games.' },
    });
    expect(restaged.status).toBe(200);
    expect(restaged.body.tournament?.matches.filter((match) => match.status === 'scheduled').every((match) => match.plannedMinutes === 9)).toBe(true);
    expect(restaged.body.tournament?.stages[0]).toMatchObject({ hasStarted: false, rosterCount: 0 });
  });

  it('draws the timetable as one lane per court', async () => {
    const timetable = (await call<TimetableView>({ path: '/timetable' })).body;
    expect(timetable.lanes.map((lane) => lane.court.label)).toEqual(['Court 1', 'Beach 2']);
    expect(timetable.lanes.flatMap((lane) => lane.matches)).toHaveLength(6);
    expect(timetable.unplaced).toEqual([]);
  });
});

/** Plays the next scheduled match to a 1 - 0 win for side a, through the facilitator's court console. */
async function playNext(): Promise<string> {
  const match = (await consoleNow()).tournament?.matches.find((row) => row.status === 'scheduled');
  if (match === undefined || match.courtId === null || match.a.teamId === null || match.b.teamId === null) throw new Error('nothing to play');
  const pair = { courtId: match.courtId, teamAId: match.a.teamId, teamBId: match.b.teamId };
  expect((await ctx.app.request('/api/tournament/matches', jsonRequest(pair, marshal.headers))).status).toBe(201);
  await ctx.app.request(`/api/tournament/matches/${match.id}/score`, jsonRequest({ side: 'a', from: 0, to: 1 }, marshal.headers));
  await ctx.app.request(`/api/tournament/matches/${match.id}/complete`, jsonRequest({ winnerTeamId: match.a.teamId }, marshal.headers));
  return match.id;
}

/** Plays seated matches to a 1 - 0 win for side a, through the facilitator's court console. */
async function playSeatedMatches(matches: readonly { id: string; courtId: string | null; a: { teamId: string | null }; b: { teamId: string | null } }[]): Promise<void> {
  for (const match of matches) {
    if (match.courtId === null || match.a.teamId === null || match.b.teamId === null) throw new Error('match not seated');
    const pair = { courtId: match.courtId, teamAId: match.a.teamId, teamBId: match.b.teamId };
    expect((await ctx.app.request('/api/tournament/matches', jsonRequest(pair, marshal.headers))).status).toBe(201);
    await ctx.app.request(`/api/tournament/matches/${match.id}/score`, jsonRequest({ side: 'a', from: 0, to: 1 }, marshal.headers));
    await ctx.app.request(`/api/tournament/matches/${match.id}/complete`, jsonRequest({ winnerTeamId: match.a.teamId }, marshal.headers));
  }
}

async function expectGhostDeskRefusals(input: { courtId: string | undefined; startAt: string }): Promise<void> {
  const ghost = '00000000-0000-4000-8000-000000000000';
  expect((await call<unknown>({ path: `/stages/${ghost}/complete`, body: {} })).status).toBe(404);
  expect((await call<unknown>({ path: `/matches/${ghost}/result`, body: { scoreA: 1, scoreB: 0, reason: 'x' } })).status).toBe(404);
  expect((await call<unknown>({ path: `/matches/${ghost}/move`, body: { courtId: input.courtId, startAt: input.startAt } })).status).toBe(404);
  expect((await call<unknown>({ path: `/matches/${ghost}/reseat`, body: { side: 'a', teamId: ghost, reason: 'x' } })).status).toBe(404);
  expect((await call<unknown>({ path: '/matches', body: { courtId: input.courtId, teamAId: teamIds[0], teamBId: teamIds[0] } })).status).toBe(400);
}

/** Stops the scheduler, plays the first stage out, and closes it by hand naming a seat (ADR-329 F2). */
async function closeFirstStageByHand(started: Console): Promise<void> {
  const group = started.tournament?.stages[0];
  // Stop the scheduler first, or it will close the group stage itself when the matches end.
  expect((await call<Console>({ path: '/scheduler/terminate', body: { reason: 'Desk is closing stages by hand.' } })).status).toBe(200);
  await playSeatedMatches(started.tournament?.matches.filter((row) => row.stageId === group?.id && row.status === 'scheduled') ?? []);
  const final = started.tournament?.matches.find((row) => row.stageId !== group?.id);
  const placed = await call<Console>({
    path: `/stages/${group?.id}/complete`,
    body: { overrides: [{ matchId: final?.id, side: 'a', teamId: teamIds[1] }], reason: 'The table winner is absent.' },
  });
  expect(placed.status).toBe(200);
  const knockout = placed.body.tournament?.matches.find((row) => row.stageLabel !== group?.label && row.a.teamId !== null);
  expect(knockout?.a.teamId).toBe(teamIds[1]);
  expect((await call<unknown>({ path: `/stages/${group?.id}/complete`, body: { overrides: [], reason: null } })).status).toBe(400);
}

describe('the day — corrections and awards', () => {
  it('corrects a result: re-paid, the old payments voided, the reason in the history', async () => {
    const matchId = await playNext();
    const corrected = await call<Console>({ path: `/matches/${matchId}/result`, body: { scoreA: 0, scoreB: 2, reason: 'Scores swapped at the court.' } });
    expect(corrected.body.tournament?.matches.find((row) => row.id === matchId)).toMatchObject({ scoreA: 0, scoreB: 2, winnerSide: 'b' });
    const awards = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.matchId, matchId)).orderBy(asc(tournamentAwards.createdAt));
    expect(awards.filter((award) => award.voidedAt === null).map((award) => award.points).sort()).toEqual([10, 30]);
    expect(awards.filter((award) => award.voidedAt !== null)).toHaveLength(2);
    const history = (await call<{ items: TournamentEventView[] }>({ path: '/events' })).body.items;
    expect(history[0]).toMatchObject({ kind: 'result_corrected', reason: 'Scores swapped at the court.', actorLabel: 'superadmin' });
  });

  it('records a walkover, and voids and unvoids a match with a reason each time', async () => {
    const next = (await consoleNow()).tournament?.matches.find((row) => row.status === 'scheduled');
    if (next === undefined) throw new Error('nothing scheduled');
    await call<Console>({ path: `/matches/${next.id}/walkover`, body: { winnerSide: 'a', reason: 'The other team never came.' } });
    expect(await matchRow(next.id)).toMatchObject({ status: 'completed', resultKind: 'walkover' });
    await call<Console>({ path: `/matches/${next.id}/void`, body: { isVoided: true, reason: 'Wrong teams entered.' } });
    expect((await matchRow(next.id))?.isVoided).toBe(true);
    await call<Console>({ path: `/matches/${next.id}/void`, body: { isVoided: false, reason: 'They were right after all.' } });
    expect((await matchRow(next.id))?.isVoided).toBe(false);
  });

  it('hands a live structure match back to the queue from the desk (ADR-329 F4)', async () => {
    const next = (await consoleNow()).tournament?.matches.find((row) => row.status === 'scheduled');
    if (next === undefined || next.courtId === null || next.a.teamId === null || next.b.teamId === null) throw new Error('nothing scheduled');
    const pair = { courtId: next.courtId, teamAId: next.a.teamId, teamBId: next.b.teamId };
    expect((await ctx.app.request('/api/tournament/matches', jsonRequest(pair, marshal.headers))).status).toBe(201);
    expect((await matchRow(next.id))?.status).toBe('in_progress');
    const handed = await call<Console>({ path: `/matches/${next.id}/hand-back`, body: {} });
    expect(handed.status).toBe(200);
    expect(handed.body.tournament?.matches.find((row) => row.id === next.id)).toMatchObject({ status: 'scheduled' });
    expect((await matchRow(next.id))?.status).toBe('scheduled');
  });

  it('awards active-day points to a team and voids them, the ledger keeping both', async () => {
    const teamId = teamIds[2] ?? '';
    await call<Console>({ path: '/awards', body: { teamId, points: 15, reason: 'Best spirit on the sand.' } });
    const [manual] = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.kind, 'manual'));
    expect(manual).toMatchObject({ points: 15, reason: 'Best spirit on the sand.', voidedAt: null });
    await call<Console>({ path: `/awards/${manual?.id}/void`, body: { reason: 'Given to the wrong team.' } });
    const [voided] = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.kind, 'manual'));
    expect(voided?.voidedAt).not.toBeNull();
    expect((await call<unknown>({ path: '/awards', body: { teamId, points: 0, reason: 'nothing' } })).status).toBe(400);
  });
});

describe('the day — contingency and the off switch', () => {
  it('previews a court out in the rain without writing, then applies it', async () => {
    const before = await consoleNow();
    const keep = before.courts[0]?.id ?? '';
    const change = { enabledCourtIds: [keep], matchMinutes: 10, changeoverMinutes: 2 };
    const preview = await call<ContingencyPreviewView>({ path: '/contingency/preview', body: change });
    expect(preview.status).toBe(200);
    expect(preview.body.changes.every((row) => row.to === null || row.to.courtLabel === 'Court 1')).toBe(true);
    expect((await consoleNow()).tournament?.matches).toEqual(before.tournament?.matches);
    const applied = await call<Console>({ path: '/contingency/apply', body: change });
    expect(applied.body.courts.map((court) => court.isEnabled)).toEqual([true, false]);
    const scheduled = applied.body.tournament?.matches.filter((row) => row.status === 'scheduled') ?? [];
    expect(scheduled.every((row) => row.courtId === keep && row.plannedMinutes === 10)).toBe(true);
    const [scheduler] = await ctx.handle.db.select().from(tournamentSchedulers);
    expect(scheduler).toMatchObject({ matchMinutes: 10, changeoverMinutes: 2 });
  });

  it('moves a match to where a person puts it, pins it there, then lets it go', async () => {
    const now = await consoleNow();
    const target = now.tournament?.matches.find((row) => row.status === 'scheduled');
    if (target === undefined) throw new Error('nothing scheduled');
    const startAt = new Date(Date.now() + 5 * 60 * 60_000).toISOString();
    const moved = await call<Console>({ path: `/matches/${target.id}/move`, body: { courtId: now.courts[0]?.id, startAt } });
    expect(moved.body.tournament?.matches.find((row) => row.id === target.id)).toMatchObject({ isPinned: true, plannedStartAt: startAt });
    await call<Console>({ path: `/matches/${target.id}/release`, body: {} });
    const [pin] = await ctx.handle.db.select().from(tournamentSchedulerPins).where(eq(tournamentSchedulerPins.matchId, target.id));
    expect(pin?.releasedAt).not.toBeNull();
    expect((await call<unknown>({ path: `/matches/${target.id}/release`, body: {} })).status).toBe(404);
  });

  it('stops the scheduler for good, and the desk still stages and calls off matches by hand', async () => {
    const stopped = await call<Console>({ path: '/scheduler/terminate', body: { reason: 'Lightning on the beach.' } });
    expect(stopped.body.tournament?.scheduler).toMatchObject({ status: 'terminated', terminateReason: 'Lightning on the beach.', terminatedByLabel: 'superadmin' });
    expect(stopped.body.tournament?.fit).toBeNull();
    expect((await call<unknown>({ path: '/scheduler/terminate', body: { reason: 'again' } })).status).toBe(400);
    const court = stopped.body.courts[0]?.id ?? '';
    const staged = await call<Console>({ path: '/matches', body: { courtId: court, teamAId: teamIds[0], teamBId: teamIds[3] } });
    const adhoc = staged.body.tournament?.matches.find((row) => row.origin === 'ad_hoc');
    expect(adhoc).toMatchObject({ status: 'in_progress', courtId: court });
    await call<Console>({ path: `/matches/${adhoc?.id}/cancel`, body: { reason: 'Staged by mistake.' } });
    expect(await matchRow(adhoc?.id ?? '')).toMatchObject({ status: 'cancelled', cancelReason: 'Staged by mistake.' });
  });

  it('withdraws a team: its unplayed matches become called-off holes', async () => {
    const teamId = teamIds[3] ?? '';
    await call<Console>({ path: `/entrants/${teamId}/withdraw`, body: { reason: 'Two players went home.' } });
    const day = (await consoleNow()).tournament;
    expect(day?.entrants.find((entrant) => entrant.teamId === teamId)?.withdrawnAt).not.toBeNull();
    const theirs = day?.matches.filter((row) => row.origin === 'structure' && (row.a.teamId === teamId || row.b.teamId === teamId)) ?? [];
    expect(theirs.filter((row) => row.status === 'scheduled')).toEqual([]);
  });

  it('refuses to close over unplayed matches without a reason, then closes with one', async () => {
    expect((await call<unknown>({ path: '/close', body: {} })).status).toBe(400);
    const closed = await call<Console>({ path: '/close', body: { reason: 'Out of daylight.' } });
    expect(closed.body.tournament).toMatchObject({ status: 'closed', closeReason: 'Out of daylight.' });
    const [row] = await ctx.handle.db.select().from(tournaments);
    expect(row?.closedAt).not.toBeNull();
    const kinds = (await ctx.handle.db.select().from(tournamentEvents)).map((event) => event.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['result_corrected', 'walkover_recorded', 'match_voided', 'match_unvoided', 'award_granted', 'award_voided', 'match_placed', 'entrant_withdrawn', 'tournament_closed']),
    );
  });
});

describe('the desk at its edges — refusals that write nothing', () => {
  it('refuses unknown courts, teams outside the tournament, and a second Start after close', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await call<unknown>({ path: `/courts/${ghost}`, body: { courtNumber: 9, label: 'Ghost' }, method: 'PUT' })).status).toBe(404);
    expect((await call<unknown>({ path: `/courts/${ghost}/enabled`, body: { isEnabled: false }, method: 'PATCH' })).status).toBe(404);
    const renumber = await call<{ error: { message: string } }>({ path: `/courts/${(await consoleNow()).courts[0]?.id}`, body: { courtNumber: 2, label: 'Clash' }, method: 'PUT' });
    expect(renumber.status).toBe(409);
    expect((await call<unknown>({ path: '/activate', body: { formatId: 'round_robin', matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 } })).status).toBe(404);
    expect((await call<unknown>({ path: '/discard', body: {} })).status).toBe(404);
    expect((await call<unknown>({ path: '/awards', body: { teamId: ghost, points: 5, reason: 'x' } })).status).toBe(404);
    expect((await call<unknown>({ path: '/contingency/preview', body: { enabledCourtIds: [], matchMinutes: 10, changeoverMinutes: 2 } })).status).toBe(400);
    expect((await call<unknown>({ path: '/contingency/apply', body: { enabledCourtIds: [], matchMinutes: 10, changeoverMinutes: 2 } })).status).toBe(400);
  });

  it('refuses a draft naming a team twice or a team that does not exist, and discards an unstarted one', async () => {
    const twice = await call<unknown>({ path: '', body: { name: 'Twice', winPoints: 1, drawPoints: 1, lossPoints: 1, teamIds: [teamIds[0], teamIds[0]] } });
    expect(twice.status).toBe(400);
    const ghost = await call<unknown>({ path: '', body: { name: 'Ghost', winPoints: 1, drawPoints: 1, lossPoints: 1, teamIds: [teamIds[0], '00000000-0000-4000-8000-000000000000'] } });
    expect(ghost.status).toBe(404);
    const draft = await call<Console>({ path: '', body: { name: 'Second day', winPoints: 1, drawPoints: 1, lossPoints: 1, teamIds: teamIds.slice(0, 2) } });
    expect(draft.body.tournament?.status).toBe('draft');
    const discarded = await call<Console>({ path: '/discard', body: {} });
    expect(discarded.body.tournament).toMatchObject({ status: 'closed', closeReason: 'Discarded before it started.' });
    expect(await ctx.handle.db.select().from(tournaments)).toHaveLength(2);
  });

  it('refuses a deadline-bearing Start of a field the format cannot hold, and a stage or match that is not there', async () => {
    await call<Console>({ path: '', body: { name: 'Third day', winPoints: 3, drawPoints: 1, lossPoints: 0, teamIds } });
    const deadlineAt = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
    const started = await call<Console>({ path: '/activate', body: { formatId: 'groups_knockout', options: { groupSize: 2, advanceCount: 1 }, matchMinutes: 10, changeoverMinutes: 2, restMinutes: 0, deadlineAt } });
    expect(started.body.tournament?.scheduler?.deadlineAt).toBe(deadlineAt);
    expect(started.body.tournament?.fit?.fitsDeadline).toBe(true);
    await expectGhostDeskRefusals({ courtId: started.body.courts[0]?.id, startAt: deadlineAt });
    await closeFirstStageByHand(started.body);
    await call<Console>({ path: '/close', body: { reason: 'Rehearsal over.' } });
  });
});

describe('the wrong party, with a valid session', () => {
  it('refuses a facilitator and a participant on the console, and writes nothing', async () => {
    const participant = await ctx.signUpParticipant();
    const before = await ctx.handle.db.select().from(tournaments);
    for (const session of [marshal, participant]) {
      expect((await call<unknown>({ path: '', session })).status).toBe(403);
      expect((await call<unknown>({ path: '/timetable', session })).status).toBe(403);
      expect((await call<unknown>({ path: '', body: { name: 'x', winPoints: 1, drawPoints: 1, lossPoints: 1, teamIds }, session })).status).toBe(403);
      expect((await call<unknown>({ path: '/courts', body: { courtNumber: 5, label: 'Five' }, session })).status).toBe(403);
    }
    expect(await ctx.handle.db.select().from(tournaments)).toEqual(before);
    expect(await ctx.handle.db.select().from(tournamentCourts).where(eq(tournamentCourts.courtNumber, 5))).toEqual([]);
  });
});
