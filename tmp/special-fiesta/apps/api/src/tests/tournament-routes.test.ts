import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CourtView, FixtureView, MatchView, TournamentBracketView, TournamentView } from '@psd/contracts';
import { messages } from '@psd/contracts';
import { newId } from '../db/ids.js';
import { tournamentAwards, tournamentCourts, tournamentEntrants, tournamentMatches, tournaments } from '../db/schema/index.js';
import { resetStatusBusForTests, subscribeToStatus, type StatusFrame } from '../lib/statusBus.js';
import { activate } from '../tournament-scheduler/scheduler.js';
import { teamNameFor } from './fixtures/names.js';
import { afterWrite } from '../routes-tournament/support.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type TestContext } from './harness.js';

/**
 * ADR-277 — the compatibility routes at the paths the kept surfaces call: a round robin on two
 * courts, driven over HTTP the way the court console drives it. Every write is read back from the
 * rows; every route has its wrong party (a session that is valid, and not the one that may act).
 */

let ctx: TestContext;
let marshal: ActorSession;
let otherMarshal: ActorSession;
let captain: ActorSession;
let tournamentId = '';
let teamIds: string[] = [];
const courtIds = [newId(), newId()];

async function get<T>(path: string, session: ActorSession) {
  const response = await ctx.app.request(path, { headers: session.headers });
  return { status: response.status, body: (await response.json()) as T };
}

async function post<T>(path: string, input: { body: unknown; session: ActorSession }) {
  const response = await ctx.app.request(path, jsonRequest(input.body, input.session.headers));
  return { status: response.status, body: (await response.json()) as T };
}

async function matchRow(id: string) {
  const [row] = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id));
  return row;
}

async function seedRoundRobin(): Promise<void> {
  const superadmin = await ctx.signInSuperadmin();
  captain = await ctx.signUpParticipant();
  teamIds = [await createTeam(ctx, captain, teamNameFor(ctx.runId))];
  for (let index = 0; index < 3; index += 1) teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
  await ctx.handle.db.insert(tournamentCourts).values(courtIds.map((id, index) => ({ id, courtNumber: index + 1, label: `Court ${index + 1}` })));
  tournamentId = newId();
  await ctx.handle.db.insert(tournaments).values({
    id: tournamentId,
    name: 'Captain’s ball',
    status: 'draft',
    winPoints: 30,
    drawPoints: 20,
    lossPoints: 10,
    createdByKind: 'superadmin',
    createdById: superadmin.id,
    createdByLabel: 'superadmin',
  });
  await ctx.handle.db.insert(tournamentEntrants).values(
    teamIds.map((teamId, index) => ({ id: newId(), tournamentId, teamId, nameSnapshot: `Team ${index + 1}`, entryOrder: index + 1 })),
  );
  const now = new Date();
  const timing = { matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0, deadlineAt: null };
  expect(await activate(ctx.handle.db, { tournamentId, formatId: 'round_robin', options: {}, ...timing, now })).toEqual({ ok: true });
  // What the desk's activate route does after the write: void the day's caches, then plan it.
  await afterWrite(ctx.handle.db, { now, isResult: false });
}

beforeAll(async () => {
  ctx = await createTestContext();
  marshal = await ctx.createFacilitator();
  otherMarshal = await ctx.createFacilitator();
});

afterAll(async () => {
  resetStatusBusForTests();
  await ctx.close();
});

describe('before any tournament — the venue exists and nothing is played', () => {
  it('lists courts, an empty feed and line-up, a planned bracket, and refuses a start', async () => {
    const spare = newId();
    await ctx.handle.db.insert(tournamentCourts).values({ id: spare, courtNumber: 9, label: 'Spare' });
    const courts = await get<{ items: CourtView[] }>('/api/tournament/courts', marshal);
    expect(courts.body.items.map((court) => [court.displayLabel, court.currentMatchId])).toEqual([['Spare', null]]);
    expect((await get<{ items: MatchView[] }>('/api/tournament/matches/feed', marshal)).body.items).toEqual([]);
    expect((await get<{ items: FixtureView[]; tournament: null }>('/api/tournament/lineups', marshal)).body).toMatchObject({ items: [], tournament: null });
    expect((await get<{ bracket: TournamentBracketView }>('/api/tournament/bracket', marshal)).body.bracket.status).toBe('planned');
    expect((await get<{ teamIds: string[] }>(`/api/tournament/courts/${spare}/recent-teams`, marshal)).body.teamIds).toEqual([]);
    expect((await get<{ match: MatchView | null }>(`/api/tournament/courts/${spare}/current-match`, marshal)).body.match).toBeNull();
    expect((await get<{ tournament: null }>('/api/tournament/schedule', marshal)).body).toMatchObject({ tournament: null, upNext: [] });
    const team = await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId));
    expect((await get<{ items: MatchView[] }>(`/api/teams/${team}/matches`, marshal)).body.items).toEqual([]);
    const start = await post<{ error: { message: string } }>('/api/tournament/matches', {
      body: { courtId: spare, teamAId: newId(), teamBId: newId() },
      session: marshal,
    });
    expect(start.status).toBe(400);
    expect(start.body.error.message).toBe(messages.tournamentNotConfigured);
    await ctx.handle.db.update(tournamentCourts).set({ isEnabled: false }).where(eq(tournamentCourts.id, spare));
  });
});

describe('a round robin, driven through the court console', () => {
  let matchId = '';

  it('serves the schedule, the line-ups and the courts in the kept shapes', async () => {
    await seedRoundRobin();
    const schedule = await get<{ tournament: TournamentView; upNext: FixtureView[]; pendingPairs: unknown[] }>(
      `/api/tournament/schedule?courtId=${courtIds[0]}`,
      marshal,
    );
    expect(schedule.status).toBe(200);
    expect(schedule.body.tournament).toMatchObject({ id: tournamentId, format: 'round_robin', status: 'group_stage' });
    expect(schedule.body.pendingPairs).toHaveLength(6);
    expect(schedule.body.upNext[0]).toMatchObject({ suggestedCourtLabel: 'Court 1', status: 'pending' });
    const lineups = await get<{ items: FixtureView[] }>('/api/tournament/lineups', captain);
    expect(lineups.body.items).toHaveLength(6);
    expect(lineups.body.items.every((row) => row.teamAId !== null && row.estimatedStartAt !== null)).toBe(true);
  });

  it('claims the queued match for the pair, in either order, and pushes it to the feed', async () => {
    const frames: StatusFrame[] = [];
    const unsubscribe = subscribeToStatus((frame) => frames.push(frame));
    const started = await post<{ match: MatchView }>('/api/tournament/matches', {
      body: { courtId: courtIds[0], teamAId: teamIds[1], teamBId: teamIds[0] },
      session: marshal,
    });
    unsubscribe();
    expect(started.status).toBe(201);
    matchId = started.body.match.id;
    expect(started.body.match).toMatchObject({ status: 'in_progress', courtLabel: 'Court 1', stage: 'group', scoreA: 0 });
    expect(await matchRow(matchId)).toMatchObject({ status: 'in_progress', origin: 'structure', courtId: courtIds[0] });
    expect(frames).toEqual([{ kind: 'feed.match', match: started.body.match }]);
    expect(await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId))).toHaveLength(6);
  });

  it('reads the live match back on the court, the feed, the court list and the match itself', async () => {
    expect((await get<{ match: MatchView }>(`/api/tournament/courts/${courtIds[0]}/current-match`, marshal)).body.match.id).toBe(matchId);
    expect((await get<{ items: MatchView[] }>('/api/tournament/matches/feed', captain)).body.items.map((row) => row.id)).toEqual([matchId]);
    const courts = await get<{ items: CourtView[] }>('/api/tournament/courts', captain);
    expect(courts.body.items.find((court) => court.id === courtIds[0])?.currentMatchId).toBe(matchId);
    expect((await get<{ match: MatchView }>(`/api/tournament/matches/${matchId}`, captain)).body.match.id).toBe(matchId);
  });

  it('moves the score one tap at a time, and refuses a stale screen without moving it', async () => {
    const tap = await post<{ match: MatchView }>(`/api/tournament/matches/${matchId}/score`, { body: { side: 'a', from: 0, to: 1 }, session: marshal });
    expect(tap.body.match.scoreA).toBe(1);
    expect((await matchRow(matchId))?.scoreA).toBe(1);
    const stale = await post<{ error: { message: string } }>(`/api/tournament/matches/${matchId}/score`, { body: { side: 'a', from: 3, to: 4 }, session: marshal });
    expect(stale.status).toBe(400);
    expect(stale.body.error.message).toBe(messages.scoreMovesByOne);
    expect((await matchRow(matchId))?.scoreA).toBe(1);
  });

  it('refuses a winner the score contradicts, and a team that is not in the match', async () => {
    const view = (await get<{ match: MatchView }>(`/api/tournament/matches/${matchId}`, marshal)).body.match;
    const wrong = await post<{ error: { message: string } }>(`/api/tournament/matches/${matchId}/complete`, { body: { winnerTeamId: view.teamBId }, session: marshal });
    expect(wrong.body.error.message).toBe(messages.winnerMustMatchScore);
    const stranger = await post<{ error: { message: string } }>(`/api/tournament/matches/${matchId}/complete`, { body: { winnerTeamId: teamIds[3] }, session: marshal });
    expect(stranger.body.error.message).toBe(messages.winnerMustBeParticipatingTeam);
    // A declared draw on 1 - 0: the engine alone would read the score as a win; the edge refuses it.
    const draw = await post<{ error: { message: string } }>(`/api/tournament/matches/${matchId}/complete`, { body: { winnerTeamId: null }, session: marshal });
    expect(draw.body.error.message).toBe(messages.drawNeedsLevelScore);
    expect((await matchRow(matchId))?.status).toBe('in_progress');
  });

  it('completes it on the score, pays both teams, and writes the history', async () => {
    const view = (await get<{ match: MatchView }>(`/api/tournament/matches/${matchId}`, marshal)).body.match;
    const done = await post<{ match: MatchView }>(`/api/tournament/matches/${matchId}/complete`, { body: { winnerTeamId: view.teamAId }, session: marshal });
    expect(done.status).toBe(200);
    expect(done.body.match).toMatchObject({ status: 'completed', winnerTeamId: view.teamAId, winPointsSnapshot: 30, lossPointsSnapshot: 10 });
    expect(await matchRow(matchId)).toMatchObject({ status: 'completed', resultKind: 'score', winnerSide: 'a' });
    const awards = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.matchId, matchId)).orderBy(asc(tournamentAwards.points));
    expect(awards.map((award) => award.points)).toEqual([10, 30]);
    expect((await get<{ items: MatchView[] }>(`/api/teams/${view.teamAId}/matches`, captain)).body.items.map((row) => row.id)).toEqual([matchId]);
    const recent = await get<{ teamIds: string[] }>(`/api/tournament/courts/${courtIds[0]}/recent-teams`, marshal);
    expect([...recent.body.teamIds].sort()).toEqual([view.teamAId, view.teamBId].sort());
  });

  it('stages an ad-hoc match for a pair the schedule no longer owes, and cancels it outright', async () => {
    const [a, b] = [teamIds[0] ?? '', teamIds[1] ?? ''];
    const adhoc = await post<{ match: MatchView }>('/api/tournament/matches', { body: { courtId: courtIds[1], teamAId: a, teamBId: b }, session: marshal });
    expect(adhoc.status).toBe(201);
    expect(await matchRow(adhoc.body.match.id)).toMatchObject({ origin: 'ad_hoc', status: 'in_progress' });
    const notMine = await post<{ error: unknown }>(`/api/tournament/matches/${adhoc.body.match.id}/cancel`, { body: {}, session: otherMarshal });
    expect(notMine.status).toBe(403);
    expect((await matchRow(adhoc.body.match.id))?.status).toBe('in_progress');
    const cancelled = await post<{ match: MatchView }>(`/api/tournament/matches/${adhoc.body.match.id}/cancel`, { body: {}, session: marshal });
    expect(cancelled.body.match.status).toBe('cancelled');
    expect((await matchRow(adhoc.body.match.id))?.status).toBe('cancelled');
  });

  it('hands a claimed match back to the queue on cancel: still owed, court free', async () => {
    const next = (await get<{ upNext: FixtureView[] }>(`/api/tournament/schedule?courtId=${courtIds[1]}`, marshal)).body.upNext[0];
    if (next === undefined || next.teamAId === null || next.teamBId === null) throw new Error('nothing queued');
    const started = await post<{ match: MatchView }>('/api/tournament/matches', { body: { courtId: courtIds[1], teamAId: next.teamAId, teamBId: next.teamBId }, session: marshal });
    expect(started.body.match.id).toBe(next.id);
    const back = await post<{ match: MatchView }>(`/api/tournament/matches/${next.id}/cancel`, { body: {}, session: marshal });
    expect(back.body.match.status).toBe('cancelled');
    expect(await matchRow(next.id)).toMatchObject({ status: 'scheduled', startedAt: null, scoreA: 0 });
    expect((await get<{ match: MatchView | null }>(`/api/tournament/courts/${courtIds[1]}/current-match`, marshal)).body.match).toBeNull();
    const lineups = (await get<{ items: FixtureView[] }>('/api/tournament/lineups', captain)).body.items;
    expect(lineups.some((row) => row.id === next.id && row.status === 'pending')).toBe(true);
  });

  it('lists only this court’s planned matches, in play order, for the court console’s Line-ups (ADR-284)', async () => {
    const all = (await get<{ items: FixtureView[] }>('/api/tournament/lineups', marshal)).body.items;
    const here = await get<{ items: FixtureView[] }>(`/api/tournament/courts/${courtIds[1]}/lineups`, marshal);
    expect(here.status).toBe(200);
    expect(here.body.items.length).toBeGreaterThan(0);
    expect(here.body.items.every((row) => row.suggestedCourtLabel === 'Court 2')).toBe(true);
    expect(here.body.items.map((row) => row.id)).toEqual(all.filter((row) => row.suggestedCourtLabel === 'Court 2').map((row) => row.id));
    expect((await get<unknown>(`/api/tournament/courts/${courtIds[1]}/lineups`, captain)).status).toBe(403);
    expect((await get<unknown>(`/api/tournament/courts/${newId()}/lineups`, marshal)).status).toBe(404);
  });

  it('tells a participant whose team is next that they are up soon, and staff never', async () => {
    const lineups = await get<{ viewerUpSoon: { fixtureId: string; gamesAway: number } | null; items: FixtureView[] }>('/api/tournament/lineups', captain);
    const mine = lineups.body.items.findIndex((row) => row.teamAId === teamIds[0] || row.teamBId === teamIds[0]);
    const expected = mine >= 0 && mine < 2 ? { fixtureId: lineups.body.items[mine]?.id, gamesAway: mine } : null;
    expect(lineups.body.viewerUpSoon).toEqual(expected);
    expect((await get<{ viewerUpSoon: unknown }>('/api/tournament/lineups', marshal)).body.viewerUpSoon).toBeNull();
  });
});

describe('the console at its edges', () => {
  it('refuses a start naming a team not in the tournament, and a finish or cancel of a match not live', async () => {
    const outsider = await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId));
    const unknown = await post<{ error: { message: string } }>('/api/tournament/matches', { body: { courtId: courtIds[0], teamAId: teamIds[0], teamBId: outsider }, session: marshal });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.message).toBe(messages.teamNotFound);
    const same = await post<{ error: { message: string } }>('/api/tournament/matches', { body: { courtId: courtIds[0], teamAId: teamIds[0], teamBId: teamIds[0] }, session: marshal });
    expect(same.body.error.message).toBe(messages.teamCannotPlayItself);
    const queued = (await get<{ items: FixtureView[] }>('/api/tournament/lineups', marshal)).body.items.find((row) => row.status === 'pending');
    if (queued === undefined) throw new Error('nothing queued');
    const finish = await post<{ error: { message: string } }>(`/api/tournament/matches/${queued.id}/complete`, { body: { winnerTeamId: null }, session: marshal });
    expect(finish.body.error.message).toBe(messages.invalidStatusTransition);
    const cancel = await post<{ error: { message: string } }>(`/api/tournament/matches/${queued.id}/cancel`, { body: {}, session: marshal });
    expect(cancel.body.error.message).toBe(messages.invalidStatusTransition);
    expect((await post<unknown>(`/api/tournament/matches/${newId()}/complete`, { body: { winnerTeamId: null }, session: marshal })).status).toBe(404);
  });

  it('tells a teamless participant and a team not due that nobody is up soon', async () => {
    const loner = await ctx.signUpParticipant();
    expect((await get<{ viewerUpSoon: unknown }>('/api/tournament/lineups', loner)).body.viewerUpSoon).toBeNull();
    const outsiderCaptain = await ctx.signUpParticipant();
    await createTeam(ctx, outsiderCaptain, teamNameFor(ctx.runId));
    expect((await get<{ viewerUpSoon: unknown }>('/api/tournament/lineups', outsiderCaptain)).body.viewerUpSoon).toBeNull();
  });

  it('serves the schedule without a court asked for', async () => {
    const schedule = await get<{ upNext: FixtureView[] }>('/api/tournament/schedule', marshal);
    expect(schedule.status).toBe(200);
    expect(schedule.body.upNext.length).toBeGreaterThan(0);
  });
});

describe('the day after it closes — results stand, nothing is queued', () => {
  it('keeps the feed and the history, empties the line-ups and the console offers', async () => {
    const desk = await ctx.signInSuperadmin();
    const live = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.status, 'in_progress'));
    expect(live).toEqual([]);
    const closed = await ctx.app.request('/api/admin/tournament/close', jsonRequest({ reason: 'Daylight gone.' }, desk.headers));
    expect(closed.status).toBe(200);
    const lineups = await get<{ items: FixtureView[]; viewerUpSoon: unknown; tournament: TournamentView }>('/api/tournament/lineups', captain);
    expect(lineups.body).toMatchObject({ items: [], viewerUpSoon: null, tournament: { status: 'completed' } });
    expect((await get<{ upNext: FixtureView[] }>('/api/tournament/schedule', marshal)).body.upNext).toEqual([]);
    expect((await get<{ items: FixtureView[] }>(`/api/tournament/courts/${courtIds[0]}/lineups`, marshal)).body.items).toEqual([]);
    expect((await get<{ items: MatchView[] }>('/api/tournament/matches/feed', captain)).body.items.length).toBeGreaterThan(0);
    const team = teamIds[0] ?? '';
    expect((await get<{ items: MatchView[] }>(`/api/teams/${team}/matches`, captain)).body.items.length).toBeGreaterThan(0);
    const start = await post<{ error: { message: string } }>('/api/tournament/matches', { body: { courtId: courtIds[0], teamAId: teamIds[2], teamBId: teamIds[3] }, session: marshal });
    expect(start.body.error.message).toBe(messages.tournamentNotConfigured);
  });
});

describe('the wrong party, with a valid session', () => {
  it('refuses a participant and the desk at every console route, and writes nothing', async () => {
    const court = courtIds[0] ?? '';
    for (const path of [`/api/tournament/courts/${court}/current-match`, `/api/tournament/courts/${court}/recent-teams`, '/api/tournament/schedule']) {
      expect((await ctx.app.request(path, { headers: captain.headers })).status).toBe(403);
    }
    const pair = { courtId: court, teamAId: teamIds[2], teamBId: teamIds[3] };
    expect((await ctx.app.request('/api/tournament/matches', jsonRequest(pair, captain.headers))).status).toBe(403);
    const desk = await ctx.signInSuperadmin();
    expect((await ctx.app.request('/api/tournament/matches', jsonRequest(pair, desk.headers))).status).toBe(403);
    expect(await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.status, 'in_progress'))).toEqual([]);
  });

  it('answers 404 for a court or a match that does not exist', async () => {
    expect((await ctx.app.request(`/api/tournament/courts/${newId()}/current-match`, { headers: marshal.headers })).status).toBe(404);
    expect((await ctx.app.request(`/api/tournament/matches/${newId()}`, { headers: marshal.headers })).status).toBe(404);
    const score = await ctx.app.request(`/api/tournament/matches/${newId()}/score`, jsonRequest({ side: 'a', from: 0, to: 1 }, marshal.headers));
    expect(score.status).toBe(404);
  });
});
