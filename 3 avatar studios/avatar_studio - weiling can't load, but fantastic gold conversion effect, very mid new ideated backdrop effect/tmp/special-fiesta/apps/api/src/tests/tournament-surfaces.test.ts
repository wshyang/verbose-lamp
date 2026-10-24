import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminMatchView, AdminTournamentConsoleView, AlertsView, FinalStandingsView, FixtureView, OperationsOverviewView } from '@psd/contracts';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type ParticipantSession, type TestContext } from './harness.js';

/**
 * ADR-280 — the shared surfaces ADR-270 quietened, fed again by the rebuilt tournament: the dashboard
 * counts, the operations panel's live matches, a captain's "up soon", the repair console's live-court
 * warning, a court facilitator's station label, and the final standings with its podium.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
const captains: ParticipantSession[] = [];
const teamIds: string[] = [];
let courtId = '';

async function adminGet<T>(path: string): Promise<T> {
  return (await (await ctx.app.request(`/api/admin${path}`, { headers: desk.headers })).json()) as T;
}

async function deskPost(path: string, body: unknown): Promise<AdminTournamentConsoleView> {
  const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, desk.headers));
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return (await response.json()) as AdminTournamentConsoleView;
}

async function marshalPost(path: string, body: unknown): Promise<void> {
  const response = await ctx.app.request(`/api/tournament${path}`, jsonRequest(body, marshal.headers));
  expect(response.status, await response.clone().text()).toBeLessThan(300);
}

/** The next match to put on court: the live one, else the earliest whose teams are both known. */
async function nextMatch(): Promise<AdminMatchView | undefined> {
  const day = await adminGet<AdminTournamentConsoleView>('/tournament');
  const matches = day.tournament?.matches ?? [];
  return matches.find((row) => row.status === 'in_progress') ?? matches.find((row) => row.status === 'scheduled' && row.a.teamId !== null && row.b.teamId !== null);
}

/** Plays a match to a 1 - 0 win for side a through the court console, starting it if it is not live. */
async function playOut(match: AdminMatchView): Promise<void> {
  if (match.status === 'scheduled') await marshalPost('/matches', { courtId, teamAId: match.a.teamId, teamBId: match.b.teamId });
  await marshalPost(`/matches/${match.id}/score`, { side: 'a', from: 0, to: 1 });
  await marshalPost(`/matches/${match.id}/complete`, { winnerTeamId: match.a.teamId });
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  for (let index = 0; index < 4; index += 1) {
    const captain = await ctx.signUpParticipant();
    captains.push(captain);
    teamIds.push(await createTeam(ctx, captain, teamNameFor(ctx.runId)));
  }
  courtId = (await deskPost('/courts', { courtNumber: 1, label: 'Sand 1' })).courts[0]?.id ?? '';
  await deskPost('', { name: 'Surfaces day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds });
  await deskPost('/activate', { formatId: 'single_elimination', options: { hasThirdPlace: true }, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
});

afterAll(async () => {
  await ctx.close();
});

describe('the shared surfaces, fed by the rebuilt tournament', () => {
  it('counts the venue courts on the dashboard', async () => {
    const dashboard = await adminGet<{ status: { courtCount: number; enabledCourtCount: number; matchCount: number } }>('/dashboard');
    expect(dashboard.status).toMatchObject({ courtCount: 1, enabledCourtCount: 1, matchCount: 0 });
  });

  it('tells the captains of the next match that their teams are up soon, and nobody else', async () => {
    const alerts = await Promise.all(
      captains.map(async (captain) => ((await (await ctx.app.request('/api/me/alerts', { headers: captain.headers })).json()) as AlertsView).teamUpSoon),
    );
    // One court: the first semi-final's two teams are up next; the other two are not yet.
    expect(alerts.filter((row) => row.upSoon)).toHaveLength(2);
    expect(alerts.filter((row) => row.upSoon).every((row) => row.gamesAway === 0)).toBe(true);
  });

  it('lists the live match on the operations panel, and warns the repair console of it', async () => {
    const lineups = (await (await ctx.app.request('/api/tournament/lineups', { headers: marshal.headers })).json()) as { items: FixtureView[] };
    const first = lineups.items[0];
    if (first === undefined || first.teamAId === null || first.teamBId === null) throw new Error('nothing queued');
    await marshalPost('/matches', { courtId, teamAId: first.teamAId, teamBId: first.teamBId });
    const operations = (await adminGet<{ overview: OperationsOverviewView }>('/operations')).overview;
    expect(operations.liveMatches).toHaveLength(1);
    expect(operations.liveMatches[0]).toMatchObject({ courtLabel: 'Sand 1', isOverdue: false });
    expect(operations.matchMinutes).toBe(12);
    expect((await adminGet<{ liveMatchCourtName: string | null }>(`/teams/${first.teamAId}/repair-context`)).liveMatchCourtName).toBe('Sand 1');
    const idle = teamIds.find((teamId) => teamId !== first.teamAId && teamId !== first.teamBId) ?? '';
    expect((await adminGet<{ liveMatchCourtName: string | null }>(`/teams/${idle}/repair-context`)).liveMatchCourtName).toBeNull();
  });

  it('names a court facilitator’s station after the court', async () => {
    const username = `court${ctx.runId}`.slice(0, 20);
    const created = await ctx.app.request(
      '/api/admin/facilitators',
      jsonRequest({ username, passcode: '2222', defaultStationType: 'court', defaultStationId: courtId }, desk.headers),
    );
    expect(created.status).toBe(201);
    const listed = await adminGet<{ items: { username: string; defaultStationLabel: string | null }[] }>('/facilitators');
    expect(listed.items.find((row) => row.username === username)?.defaultStationLabel).toBe('Sand 1');
    // The same label is the one the facilitator's own session carries after sign-in.
    const signIn = await ctx.app.request('/api/auth/facilitators/signin', jsonRequest({ username, passcode: '2222' }));
    const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';
    const session = (await (await ctx.app.request('/api/auth/session', { headers: { cookie } })).json()) as { defaultStation: { label: string | null } };
    expect(session.defaultStation.label).toBe('Sand 1');
  });

  it('prints a provisional record, then the podium once the final and third place are played', async () => {
    expect((await adminGet<{ standings: FinalStandingsView }>('/standings/final')).standings).toMatchObject({ isProvisional: true, tournamentStatus: 'knockout', podium: [] });
    // Two semi-finals, then the final and the third-place match: four results.
    for (let played = 0; played < 4; played += 1) {
      const match = await nextMatch();
      if (match === undefined) throw new Error(`nothing to play after ${played}`);
      await playOut(match);
    }
    await deskPost('/close', { reason: null });
    const record = (await adminGet<{ standings: FinalStandingsView }>('/standings/final')).standings;
    expect(record).toMatchObject({ isProvisional: false, tournamentStatus: 'completed' });
    expect(record.podium.map((place) => [place.place, place.basis])).toEqual([
      [1, 'Won the final'],
      [2, 'Lost the final'],
      [3, 'Won the third-place match'],
    ]);
    expect((await adminGet<{ status: { matchCount: number } }>('/dashboard')).status.matchCount).toBe(4);
  });
});

describe('final standings for a day with no final — the table decides', () => {
  it('withholds the rostrum while matches remain, then reads it off the table, with group rows', async () => {
    const teams = teamIds.slice(0, 3);
    await deskPost('', { name: 'Table day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds: teams });
    await deskPost('/activate', { formatId: 'round_robin', matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
    const early = (await adminGet<{ standings: FinalStandingsView }>('/standings/final')).standings;
    expect(early).toMatchObject({ isProvisional: true, tournamentStatus: 'group_stage', podium: [] });
    expect(early.teams.map((row) => row.played)).toEqual([0, 0, 0]);
    const first = await nextMatch();
    if (first === undefined) throw new Error('nothing to play');
    // A walkover: a result with no score, so both teams in it have a difference that is a partial sum.
    await deskPost(`/matches/${first.id}/walkover`, { winnerSide: 'a', reason: 'No-show.' });
    for (let played = 1; played < 3; played += 1) {
      const match = await nextMatch();
      if (match === undefined) throw new Error(`nothing to play after ${played}`);
      await playOut(match);
    }
    const record = (await adminGet<{ standings: FinalStandingsView }>('/standings/final')).standings;
    expect(record.podium.map((place) => place.basis)).toEqual(['Top of the table', 'Second in the table', 'Third in the table']);
    expect(record.teams.filter((row) => !row.isFullyScored)).toHaveLength(2);
    await deskPost('/close', { reason: null });
  });
});
