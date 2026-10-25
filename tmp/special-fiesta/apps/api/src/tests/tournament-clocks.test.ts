import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView, TeamUpSoonView } from '@psd/contracts';
import { tournamentMatches, tournamentSchedulers } from '../db/schema/index.js';
import { resetStatusBusForTests, subscribeToTeamStatus, type TeamStatusFrame } from '../lib/statusBus.js';
import { publishUpSoonChanges, resetUpSoonWatchForTests } from '../lib/upSoonWatch.js';
import { tickSchedule } from '../routes-tournament/support.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type TestContext } from './harness.js';

/**
 * ADR-282 — the two clocks `index.ts` starts: the up-soon watcher (ADR-121, restored) publishes only
 * transitions, and only to a room with someone in it; the scheduler tick re-plans as time passes.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
const teamIds: string[] = [];
let courtId = '';

async function deskPost(path: string, body: unknown): Promise<AdminTournamentConsoleView> {
  const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, desk.headers));
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return (await response.json()) as AdminTournamentConsoleView;
}

/** Frames per team, from a subscription on every entered team's topic. */
function listen(): { frames: Map<string, TeamUpSoonView[]>; stop: () => void } {
  const frames = new Map<string, TeamUpSoonView[]>();
  const stops = teamIds.map((teamId) =>
    subscribeToTeamStatus(teamId, (frame: TeamStatusFrame) => {
      if (frame.kind === 'team.upsoon') frames.set(teamId, [...(frames.get(teamId) ?? []), frame.upSoon]);
    }),
  );
  return { frames, stop: () => stops.forEach((stop) => stop()) };
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  for (let index = 0; index < 4; index += 1) teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
  courtId = (await deskPost('/courts', { courtNumber: 1, label: 'Court 1' })).courts[0]?.id ?? '';
  await deskPost('', { name: 'Clock day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds });
  await deskPost('/activate', { formatId: 'single_elimination', options: {}, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
});

afterEach(() => {
  resetStatusBusForTests();
});

afterAll(async () => {
  await ctx.close();
});

describe('the up-soon watcher — transitions only, and only to a room with someone in it', () => {
  it('skips the whole tick when nobody is listening', async () => {
    resetUpSoonWatchForTests();
    expect(await publishUpSoonChanges(ctx.handle.db)).toBe(0);
  });

  it('tells the two teams of the first semi-final they are up, then stays quiet while nothing moves', async () => {
    resetUpSoonWatchForTests();
    const room = listen();
    expect(await publishUpSoonChanges(ctx.handle.db)).toBe(2);
    expect([...room.frames.values()].flat().every((frame) => frame.upSoon && frame.gamesAway === 0)).toBe(true);
    expect(await publishUpSoonChanges(ctx.handle.db)).toBe(0);
    room.stop();
  });

  it('tells the loser it has left the window once the match is played, and the next pair they are up', async () => {
    const room = listen();
    const day = (await (await ctx.app.request('/api/admin/tournament', { headers: desk.headers })).json()) as AdminTournamentConsoleView;
    const first = day.tournament?.matches.find((row) => row.status === 'scheduled' && row.a.teamId !== null);
    if (first === undefined) throw new Error('nothing queued');
    const post = (path: string, body: unknown) => ctx.app.request(`/api/tournament${path}`, jsonRequest(body, marshal.headers));
    await post('/matches', { courtId, teamAId: first.a.teamId, teamBId: first.b.teamId });
    await post(`/matches/${first.id}/score`, { side: 'a', from: 0, to: 1 });
    await post(`/matches/${first.id}/complete`, { winnerTeamId: first.a.teamId });
    expect(await publishUpSoonChanges(ctx.handle.db)).toBeGreaterThanOrEqual(3);
    expect(room.frames.get(first.b.teamId ?? '')?.at(-1)).toEqual({ upSoon: false, gamesAway: null, fixtureId: null });
    const nowUp = [...room.frames.entries()].filter(([teamId, frames]) => teamId !== first.a.teamId && frames.at(-1)?.upSoon);
    expect(nowUp).toHaveLength(2);
    room.stop();
  });
});

describe('the scheduler tick — the plan moves with the clock', () => {
  it('re-plans the queue onto a later clock, as the planner sees it', async () => {
    const before = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.status, 'scheduled'));
    const latest = Math.max(...before.map((row) => row.plannedStartAt?.getTime() ?? 0));
    const later = new Date(latest + 3 * 60 * 60_000);
    await tickSchedule(ctx.handle.db, later);
    const after = await ctx.handle.db.select().from(tournamentMatches).where(eq(tournamentMatches.status, 'scheduled'));
    expect(after.every((row) => (row.plannedStartAt?.getTime() ?? 0) >= later.getTime() - 60_000)).toBe(true);
    const [scheduler] = await ctx.handle.db.select().from(tournamentSchedulers);
    expect(scheduler?.plannedAt?.getTime()).toBe(later.getTime());
  });

  it('logs a failed re-plan and carries on rather than rejecting', async () => {
    const broken = new Proxy(ctx.handle.db, {
      get: () => () => {
        throw new Error('the database went away');
      },
    });
    await expect(tickSchedule(broken, new Date())).resolves.toBeUndefined();
  });
});
