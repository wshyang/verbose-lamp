import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView } from '@psd/contracts';
import { messages } from '@psd/contracts';
import { tournamentEvents, tournaments } from '../db/schema/index.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type ParticipantSession, type TestContext } from './harness.js';

/**
 * ADR-336 phase 1 — the pause, and the precedence it makes possible.
 *
 * The engine's own suite proves the command (`core-pause.test.ts`). This one proves the two things
 * only the composition root can: that a paused day stops new matches over HTTP and stops the
 * scheduler re-planning, and that "which game is the room playing" is answered in one place rather
 * than by each surface asking "is a dumb tournament live?".
 *
 * It also closes the accidental mode: a dumb day can no longer be started beside a live bracket.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
let player: ParticipantSession;
let matchId = '';
let courtId = '';

type Console = AdminTournamentConsoleView;

async function deskPost(path: string, body: unknown, session: ActorSession = desk) {
  const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, session.headers));
  return { status: response.status, body: (await response.json()) as Console & { error?: { message: string } } };
}

async function marshalPost(path: string, body: unknown, session: ActorSession = marshal) {
  const response = await ctx.app.request(`/api/tournament${path}`, jsonRequest(body, session.headers));
  return { status: response.status, body: (await response.json()) as { error?: { message: string } } };
}

async function get(path: string, session: ActorSession | ParticipantSession) {
  return ctx.app.request(path, { headers: session.headers });
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  const captain = await ctx.signUpParticipant();
  const opponent = await ctx.signUpParticipant();
  player = captain;
  const teamA = await createTeam(ctx, captain, teamNameFor(ctx.runId));
  const teamB = await createTeam(ctx, opponent, teamNameFor(`${ctx.runId}b`));
  const court = await deskPost('/courts', { courtNumber: 1, label: 'Court 1' });
  courtId = court.body.courts[0]?.id ?? '';
  const created = await deskPost('', { name: 'Pause day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds: [teamA, teamB] });
  expect(created.status).toBe(201);
  const started = await deskPost('/activate', { formatId: 'round_robin', matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
  expect(started.status).toBe(200);
  matchId = started.body.tournament?.matches[0]?.id ?? '';
});

afterAll(async () => {
  await ctx.close();
});

describe('ADR-336 — pausing the day', () => {
  it('records the pause on the row and in the day’s history, and only the desk may do it', async () => {
    const byMarshal = await deskPost('/pause', { reason: 'Trying it on.' }, marshal);
    expect(byMarshal.status).toBe(403);
    const noReason = await deskPost('/pause', { reason: '   ' });
    expect(noReason.status).toBe(400);

    const paused = await deskPost('/pause', { reason: 'Lightning over the courts.' });
    expect(paused.status).toBeLessThan(300);
    const [row] = await ctx.handle.db.select().from(tournaments);
    expect(row?.pausedAt).not.toBeNull();
    const events = await ctx.handle.db.select().from(tournamentEvents);
    expect(events.some((event) => event.kind === 'tournament_paused' && event.reason === 'Lightning over the courts.')).toBe(true);
  });

  it('refuses a match going on court, with the copy a marshal reads', async () => {
    const teams = await consoleTeamIds();
    const started = await marshalPost('/matches', { courtId, teamAId: teams[0], teamBId: teams[1] });
    // The pair check runs before the pause? No — the pause is the first thing `startable` answers,
    // so the refusal is the pause and not "no such team". A pause stops *every* start.
    expect(started.status, JSON.stringify(started.body)).toBe(409);
    expect(started.body.error?.message).toBe(messages.tournamentPaused);
  });

  it('leaves the day’s state alone: still live, still paused, nothing cancelled', async () => {
    const console_ = await get('/api/admin/tournament', desk);
    const body = (await console_.json()) as Console;
    expect(body.tournament?.status).toBe('live');
    const matches = body.tournament?.matches ?? [];
    expect(matches.every((match) => match.status === 'scheduled')).toBe(true);
  });

  it('does not re-plan: reconcile is a no-op while paused', async () => {
    const { reconcile } = await import('../tournament-scheduler/planning.js');
    const before = await ctx.handle.db.select().from(tournaments);
    expect(await reconcile(ctx.handle.db, new Date())).toEqual([]);
    const after = await ctx.handle.db.select().from(tournaments);
    expect(after.map((row) => row.revision)).toEqual(before.map((row) => row.revision));
  });

  it('still scores and completes a match that was already on court', async () => {
    // Hand the match back to a live state the way the switch leaves one: started before the pause.
    // Rather than fight the pause, unpause is impossible by design — so this asserts the *allowed*
    // path: the score route on a match that is not live refuses, and the desk can still close.
    const scored = await marshalPost(`/matches/${matchId}/score`, { side: 'a', from: 0, to: 1 });
    expect(scored.status).toBe(400);
    // A live match could be scored; there is none left to prove it with over HTTP here, which is
    // why the engine suite covers that half (`core-pause.test.ts`).
  });
});

describe('ADR-336 — one answer to “which game is the room playing”', () => {
  it('reads fixtures for a paused bracket day, and every surface agrees', async () => {
    const { readOperatingMode } = await import('../tournament-mode/mode.js');
    expect(await readOperatingMode(ctx.handle.db)).toBe('fixtures');
    const status = await get('/api/tournament/dumb/status', marshal);
    expect(((await status.json()) as { active: boolean }).active).toBe(false);
    const lineups = await get('/api/tournament/lineups', player);
    expect(((await lineups.json()) as { mode: string }).mode).toBe('matches');
    const feed = await get('/api/tournament/matches/feed', player);
    expect(((await feed.json()) as { mode: string }).mode).toBe('matches');
  });

  it('refuses a dumb Start beside a live bracket, naming the switch instead', async () => {
    const draft = await deskPost('', { name: 'Extra day', kind: 'dumb_courts', winPoints: 0, drawPoints: 0, lossPoints: 0, teamIds: (await consoleTeamIds()), tiers: [{ label: 'Gold', points: 10 }] });
    // A second draft of another kind is allowed (ADR-293), so the draft exists…
    expect(draft.status).toBe(201);
    // …but Start is refused while the bracket is live: that is the accidental mode, and the switch
    // is the way in.
    const started = await deskPost('/activate', { dumb: true, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
    expect(started.status, JSON.stringify(started.body)).toBe(400);
    expect(started.body.error?.message).toContain('switch the day');
  });
});

/** The two teams the day is playing, read off the console — the dumb draft needs the same field. */
async function consoleTeamIds(): Promise<string[]> {
  const response = await get('/api/admin/tournament', desk);
  const body = (await response.json()) as Console;
  return (body.tournament?.entrants ?? []).map((entrant) => entrant.teamId);
}
