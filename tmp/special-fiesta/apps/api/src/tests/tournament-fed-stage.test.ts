import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { messages } from '@psd/contracts';
import type { AdminTournamentConsoleView } from '@psd/contracts';
import { tournamentCourts } from '../db/schema/index.js';
import { newId } from '../db/ids.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type TestContext } from './harness.js';

/**
 * ADR-325 — an open stage fed by an earlier stage, driven over HTTP the way the Control subtab
 * drives it. The pass condition is the route's answer for a team that did not come through, and
 * that the same route still stages a team that did: an authorisation rule with only its refusal
 * tested could be refusing everyone.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
const teamIds: string[] = [];
const courtId = newId();
type Console = AdminTournamentConsoleView;

async function call<T>(path: string, body?: unknown, session: ActorSession = desk) {
  const init = body === undefined ? { headers: session.headers } : jsonRequest(body, session.headers);
  const response = await ctx.app.request(`/api/admin/tournament${path}`, init);
  return { status: response.status, body: (await response.json()) as T };
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  await ctx.handle.db.insert(tournamentCourts).values({ id: courtId, courtNumber: 1, label: 'Court 1' });
  for (let index = 0; index < 6; index += 1) teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
});

afterAll(async () => {
  await ctx.close();
});

/** Plays every scheduled match to a win for side a, through the facilitator's court console. */
async function playOut(): Promise<void> {
  for (let guard = 0; guard < 40; guard += 1) {
    const day = (await call<Console>('')).body.tournament;
    const next = day?.matches.find((row) => row.status === 'scheduled' && row.a.teamId !== null && row.b.teamId !== null && row.courtId !== null);
    if (next === undefined) return;
    const pair = { courtId: next.courtId, teamAId: next.a.teamId, teamBId: next.b.teamId };
    await ctx.app.request('/api/tournament/matches', jsonRequest(pair, marshal.headers));
    await ctx.app.request(`/api/tournament/matches/${next.id}/score`, jsonRequest({ side: 'a', from: 0, to: 1 }, marshal.headers));
    await ctx.app.request(`/api/tournament/matches/${next.id}/complete`, jsonRequest({ winnerTeamId: next.a.teamId }, marshal.headers));
  }
}

describe('an open stage fed by a pool', () => {
  it('starts, and the desk sees the fed stage before anyone has come through', async () => {
    const created = await call<Console>('', { name: 'Fed open', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds });
    expect(created.status).toBe(201);
    const started = await call<Console>('/activate', {
      pipeline: {
        stages: [
          { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 10, options: { groupSize: 3, advanceCount: 1 } },
          { code: 'FUN', label: 'Open play', format: 'open', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 10 },
        ],
      },
      matchMinutes: 10,
      changeoverMinutes: 2,
      restMinutes: 0,
    });
    expect(started.status).toBe(200);
    expect(started.body.tournament?.stages.map((stage) => stage.label)).toEqual(['Groups', 'Open play']);
  });

  /** The stage with this label, as the desk's console now shows it. */
  async function stageNamed(label: string) {
    const day = (await call<Console>('')).body.tournament;
    const found = day?.stages.find((stage) => stage.label === label);
    if (found === undefined) throw new Error(`no stage ${label}`);
    return found;
  }

  /** The scheduler closes a stage itself when nothing straddles a cut (ADR-282); otherwise the desk does. */
  async function closeStage(label: string): Promise<void> {
    const stage = await stageNamed(label);
    if (stage.status === 'completed') return;
    const closed = await call<unknown>(`/stages/${stage.id}/complete`, { overrides: [], reason: null });
    if (closed.status !== 200) throw new Error(`stage close answered ${closed.status}: ${JSON.stringify(closed.body)}`);
  }

  async function sidesOfRoster() {
    const advancers = (await stageNamed('Groups')).advancers.map((row) => row.teamId);
    const inside = advancers.filter((id): id is string => id !== null);
    return { inside, outside: teamIds.filter((id) => !inside.includes(id)) };
  }

  it('after the feeder closes, stages a team that came through and refuses one that did not', async () => {
    await playOut();
    await closeStage('Groups');
    expect((await stageNamed('Open play')).status).toBe('active');
    const { inside, outside } = await sidesOfRoster();
    expect(inside).toHaveLength(4);
    expect(outside).toHaveLength(2);

    // Wrong party: a team outside the roster, in either seat.
    for (const pair of [{ teamAId: inside[0], teamBId: outside[0] }, { teamAId: outside[0], teamBId: inside[0] }]) {
      const refused = await call<{ error: { message: string } }>('/matches', { courtId, ...pair });
      expect(refused.status).toBe(400);
      expect(refused.body.error.message).toBe(messages.teamNotInStage);
    }
    // Right party: two teams that came through. The same route, the same session.
    const accepted = await call<Console>('/matches', { courtId, teamAId: inside[0], teamBId: inside[1] });
    expect(accepted.status).toBe(200);
    expect(accepted.body.tournament?.matches.some((row) => row.origin === 'ad_hoc' && row.stageLabel === 'Open play')).toBe(true);
  });

  it('the desk can close the open stage itself, and then the day (ADR-329 F7)', async () => {
    const day = (await call<Console>('')).body.tournament;
    const open = day?.stages.find((stage) => stage.label === 'Open play');
    const staged = day?.matches.find((row) => row.stageLabel === 'Open play' && row.status !== 'completed' && row.status !== 'cancelled');
    // The staged friendly is still on the court; it is called off first, as the desk would.
    if (staged !== undefined) {
      expect((await call<unknown>(`/matches/${staged.id}/cancel`, { reason: 'Open play is done.' })).status).toBe(200);
    }
    const closed = await call<Console>(`/stages/${open?.id}/complete`, { overrides: [], reason: 'The fringe programme takes the courts now.' });
    expect(closed.status).toBe(200);
    expect(closed.body.tournament?.stages.find((stage) => stage.label === 'Open play')?.status).toBe('completed');
    const closedDay = await call<Console>('/close', { reason: 'The day is done.' });
    expect(closedDay.status).toBe(200);
  });

  it('a facilitator cannot stage a desk match at all, whatever the roster says', async () => {
    const refused = await call<unknown>('/matches', { courtId, teamAId: teamIds[0], teamBId: teamIds[1] }, marshal);
    expect(refused.status).toBe(403);
  });
});
