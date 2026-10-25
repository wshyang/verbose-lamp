import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { createApp } from './app.js';
import { createDatabase, type DatabaseContext } from './db/database.js';
import { matches, teams as teamsTable, tournaments } from './db/schema.js';
import type { ModeId, TournamentSnapshot } from '../shared/contracts.js';
import { createTestDatabase } from '../test/database.js';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await createTestDatabase();
  app = createApp(database.db);
});

afterAll(async () => {
  await database.close();
});

describe('tournament API with PGlite', () => {
  it('serves health, the format catalog, and an empty event list', async () => {
    expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
    const formats = await request(app).get('/api/formats').expect(200);
    expect(formats.body.map((format: { id: string }) => format.id)).toContain('flighted-quads');
    expect((await request(app).get('/api/tournaments').expect(200)).body).toEqual([]);
  });

  it('returns a non-persistent World Cup simulation with linked, unresolved advancement slots', async () => {
    const simulation = await request(app).post('/api/simulations').send(input('world-cup', 10)).expect(200);
    expect(simulation.body.matches).toHaveLength(23);
    const final = simulation.body.matches.at(-1);
    expect(final.participants.every((slot: { resolvedTeamId: string | null }) => slot.resolvedTeamId === null)).toBe(true);
    expect(final.dependsOn.length).toBeGreaterThan(0);
    expect((await request(app).get('/api/tournaments').expect(200)).body).toEqual([]);
  });

  it('rejects invalid field sizes and malformed JSON with safe errors', async () => {
    const invalidFormat = input('world-cup', 12);
    await request(app).post('/api/simulations').send(invalidFormat).expect(422);
    await request(app).post('/api/tournaments').send({ name: '', mode: 'manual' }).expect(422);
    await request(app)
      .post('/api/simulations')
      .set('Content-Type', 'application/json')
      .send('{not-json')
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('INVALID_JSON'));
    await request(app).get('/api/tournaments/not-a-uuid').expect(422);
    await request(app).get(`/api/tournaments/${v7()}`).expect(404);
  });

  it('creates a round-robin event and persists its generalized match graph', async () => {
    const created = await createEvent('round-robin', 4);
    expect(created.teams).toHaveLength(4);
    expect(created.matches).toHaveLength(6);
    expect(created.matches.every((match) => match.participants.length === 2)).toBe(true);
    expect(created.scheduleSummary.matchCount).toBe(6);
    const fetched = await request(app).get(`/api/tournaments/${created.tournament.id}`).expect(200);
    expect(fetched.body.tournament.name).toBe('Test Event');
    expect(fetched.body.matches).toHaveLength(6);
    expect((await request(app).get('/api/tournaments').expect(200)).body).toHaveLength(1);
  });

  it('stages, scores, and finalises a match and awards outcome points', async () => {
    const event = await createEvent('manual', 4);
    const [home, away] = event.teams;
    const staged = await request(app)
      .post(`/api/tournaments/${event.tournament.id}/matches`)
      .send({ homeTeamId: home!.id, awayTeamId: away!.id, phase: 'Court call' })
      .expect(201);
    const match = staged.body.matches[0];
    expect(match.code).toMatch(/^DESK-/);
    expect(match.participants[0].displayName).toBe(home!.name);
    const live = await request(app)
      .post(matchPath(event.tournament.id, match.id, 'score'))
      .send({ home: 5, away: 3 })
      .expect(200);
    expect(findMatch(live.body, match.id).status).toBe('live');
    const final = await request(app)
      .post(matchPath(event.tournament.id, match.id, 'finalize'))
      .send({ home: 5, away: 3 })
      .expect(200);
    expect(findMatch(final.body, match.id)).toMatchObject({ status: 'final', score: { home: 5, away: 3, winnerTeamId: home!.id } });
    expect(final.body.pointEntries).toHaveLength(1);
    expect(final.body.pointEntries[0]).toMatchObject({ teamId: home!.id, points: 3, kind: 'outcome-award' });
    expect(final.body.standings.find((row: { teamId: string }) => row.teamId === home!.id).points).toBe(3);
  });

  it('refuses to score a malformed fixture that resolves one team into both slots', async () => {
    const event = await createEvent('manual', 2);
    const staged = await stageMatch(event, 0, 1);
    await database.db.update(matches)
      .set({ awaySlot: { kind: 'team', teamId: event.teams[0]!.id, label: event.teams[0]!.name } })
      .where(eq(matches.id, staged.id));
    const response = await request(app)
      .post(matchPath(event.tournament.id, staged.id, 'score'))
      .send({ home: 1, away: 0 })
      .expect(409);
    expect(response.body.error.message).toBe('A team cannot play itself.');
  });

  it('records valid draws and requires an advancement decision for a tied elimination match', async () => {
    const openPlay = await createEvent('manual', 2);
    const staged = await stageMatch(openPlay, 0, 1);
    await saveLiveScore(openPlay.tournament.id, staged.id, 1, 1);
    const draw = await request(app)
      .post(matchPath(openPlay.tournament.id, staged.id, 'finalize'))
      .send({ home: 1, away: 1 })
      .expect(200);
    expect(draw.body.pointEntries).toHaveLength(2);
    expect(draw.body.pointEntries.every((entry: { points: number }) => entry.points === 1)).toBe(true);

    const awayWinEvent = await createEvent('manual', 2);
    const awayWinMatch = await stageMatch(awayWinEvent, 0, 1);
    await saveLiveScore(awayWinEvent.tournament.id, awayWinMatch.id, 1, 2);
    const awayWin = await request(app)
      .post(matchPath(awayWinEvent.tournament.id, awayWinMatch.id, 'finalize'))
      .send({ home: 1, away: 2 })
      .expect(200);
    expect(findMatch(awayWin.body, awayWinMatch.id).score?.winnerTeamId).toBe(awayWinEvent.teams[1]!.id);

    const bracket = await createEvent('single-elimination', 4);
    const firstMatch = bracket.matches[0]!;
    const teamOne = firstMatch.participants[0].resolvedTeamId!;
    await saveLiveScore(bracket.tournament.id, firstMatch.id, 2, 2);
    await request(app)
      .post(matchPath(bracket.tournament.id, firstMatch.id, 'finalize'))
      .send({ home: 2, away: 2 })
      .expect(422);
    await request(app)
      .post(matchPath(bracket.tournament.id, firstMatch.id, 'finalize'))
      .send({ home: 2, away: 2, advancingTeamId: v7() })
      .expect(422);
    const resolved = await request(app)
      .post(matchPath(bracket.tournament.id, firstMatch.id, 'finalize'))
      .send({ home: 2, away: 2, advancingTeamId: teamOne })
      .expect(200);
    const downstream = resolved.body.matches.find((match: { participants: Array<{ reference: { matchId?: string } }> }) =>
      match.participants.some((participant) => participant.reference.matchId === firstMatch.id),
    );
    expect(downstream.participants.some((participant: { resolvedTeamId: string | null }) => participant.resolvedTeamId === teamOne)).toBe(true);
  });

  it('enforces a score winner over an explicit advancing team and skips zero-point awards', async () => {
    const bracket = await createEvent('single-elimination', 4);
    const first = bracket.matches[0]!;
    const homeId = first.participants[0].resolvedTeamId!;
    const awayId = first.participants[1].resolvedTeamId!;
    await saveLiveScore(bracket.tournament.id, first.id, 2, 1);
    await request(app)
      .post(matchPath(bracket.tournament.id, first.id, 'finalize'))
      .send({ home: 2, away: 1, advancingTeamId: awayId })
      .expect(422);
    const final = await request(app)
      .post(matchPath(bracket.tournament.id, first.id, 'finalize'))
      .send({ home: 2, away: 1, advancingTeamId: homeId })
      .expect(200);
    expect(final.body.matches.find((match: { id: string }) => match.id === first.id).score.winnerTeamId).toBe(homeId);

    const noAwards = await createEvent('manual', 2);
    const staged = await stageMatch(noAwards, 0, 1);
    await database.db.update(tournaments).set({ winPoints: 0, drawPoints: 0, lossPoints: 0 })
      .where(eq(tournaments.id, noAwards.tournament.id));
    await saveLiveScore(noAwards.tournament.id, staged.id, 2, 1);
    const result = await request(app)
      .post(matchPath(noAwards.tournament.id, staged.id, 'finalize'))
      .send({ home: 2, away: 1 })
      .expect(200);
    expect(result.body.pointEntries).toHaveLength(0);
  });

  it('resolves World Cup group-winner slots only after all pool results are final', async () => {
    const event = await createEvent('points-rush', 12);
    const groupMatches = event.matches.filter((match) => match.groupKey !== null);
    for (const match of groupMatches) {
      const homeId = match.participants[0].resolvedTeamId!;
      await saveLiveScore(event.tournament.id, match.id, 2, 1);
      await request(app)
        .post(matchPath(event.tournament.id, match.id, 'finalize'))
        .send({ home: 2, away: 1 })
        .expect(200);
      expect(homeId).toBeTruthy();
    }
    const completed = await request(app).get(`/api/tournaments/${event.tournament.id}`).expect(200);
    const final = completed.body.matches.find((match: { code: string }) => match.code === 'PR-FINAL');
    expect(final.participants.every((participant: { resolvedTeamId: string | null }) => participant.resolvedTeamId !== null)).toBe(true);
  });

  it('replans unstarted matches in rain while preserving a live game', async () => {
    const event = await createEvent('round-robin', 6, { courtCount: 3, matchDurationMinutes: 20 });
    const liveMatch = event.matches.find((match) => match.schedule.courtNumber === 3)!;
    await saveLiveScore(event.tournament.id, liveMatch.id, 1, 0);
    const updated = await request(app)
      .patch(`/api/tournaments/${event.tournament.id}/resources`)
      .send({ courtCount: 1, matchDurationMinutes: 35, effectiveAtMinutes: 600 })
      .expect(200);
    expect(updated.body.tournament.courtCount).toBe(1);
    expect(findMatch(updated.body, liveMatch.id).schedule).toEqual(liveMatch.schedule);
    const pending = updated.body.matches.filter((match: { status: string }) => match.status === 'staged');
    expect(pending.every((match: { schedule: { courtNumber: number; durationMinutes: number; startMinute: number } }) =>
      match.schedule.courtNumber === 1 && match.schedule.durationMinutes === 35 && match.schedule.startMinute >= 600,
    )).toBe(true);
  });

  it('keeps point awards in an append-only ledger and allows a one-time void', async () => {
    const event = await createEvent('manual', 3);
    const team = event.teams[0]!;
    const awarded = await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points`)
      .send({ teamId: team.id, points: 7, reason: 'Volunteer award' })
      .expect(201);
    const award = awarded.body.pointEntries[0];
    expect(award.voided).toBe(false);
    const voided = await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points/${award.id}/void`)
      .send({ reason: 'Entered in error' })
      .expect(201);
    expect(voided.body.pointEntries.find((entry: { id: string }) => entry.id === award.id).voided).toBe(true);
    expect(voided.body.pointEntries.some((entry: { kind: string; points: number }) => entry.kind === 'void' && entry.points === -7)).toBe(true);
    expect(voided.body.standings.find((row: { teamId: string }) => row.teamId === team.id).points).toBe(0);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points/${award.id}/void`)
      .send({ reason: 'Again' })
      .expect(409);
    const voidEntry = voided.body.pointEntries.find((entry: { kind: string }) => entry.kind === 'void');
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points/${voidEntry.id}/void`)
      .send({ reason: 'Reverse reversal' })
      .expect(409);
  });

  it('scopes and validates match-linked point awards and protects closed ledgers', async () => {
    const event = await createEvent('manual', 2);
    const match = await stageMatch(event, 0, 1);
    const team = event.teams[0]!;
    const linked = await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points`)
      .send({ teamId: team.id, points: 2, reason: 'Match conduct', matchId: match.id })
      .expect(201);
    expect(linked.body.pointEntries[0].matchId).toBe(match.id);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points`)
      .send({ teamId: team.id, points: 2, reason: 'Missing match', matchId: v7() })
      .expect(404);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points`)
      .send({ teamId: v7(), points: 2, reason: 'Unknown team' })
      .expect(404);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points`)
      .send({ teamId: team.id, points: 10001, reason: 'Too many' })
      .expect(422);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points`)
      .send({ teamId: team.id, points: 2, reason: 'x'.repeat(501) })
      .expect(422);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points/${linked.body.pointEntries[0].id}/void`)
      .send({ reason: ' ' })
      .expect(422);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points/${linked.body.pointEntries[0].id}/void`)
      .send({ reason: 'x'.repeat(501) })
      .expect(422);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/close`)
      .send({ reason: 'Desk closed' })
      .expect(200);
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/points/${linked.body.pointEntries[0].id}/void`)
      .send({ reason: 'After close' })
      .expect(409);
  });

  it('rejects cross-event IDs on scoring, staging, and points routes', async () => {
    const first = await createEvent('manual', 2);
    const second = await createEvent('manual', 2);
    const match = await stageMatch(first, 0, 1);
    const foreignTeam = first.teams[0]!;
    await request(app)
      .post(matchPath(second.tournament.id, match.id, 'score'))
      .send({ home: 1, away: 0 })
      .expect(404);
    await request(app)
      .post(`/api/tournaments/${second.tournament.id}/matches`)
      .send({ homeTeamId: foreignTeam.id, awayTeamId: second.teams[1]!.id })
      .expect(404);
    const award = await request(app)
      .post(`/api/tournaments/${first.tournament.id}/points`)
      .send({ teamId: foreignTeam.id, points: 2, reason: 'Test award' })
      .expect(201);
    await request(app)
      .post(`/api/tournaments/${second.tournament.id}/points/${award.body.pointEntries[0].id}/void`)
      .send({ reason: 'Wrong event' })
      .expect(404);
  });

  it('closes a day deliberately and prevents writes afterwards', async () => {
    const incomplete = await createEvent('round-robin', 3);
    await request(app)
      .post(`/api/tournaments/${incomplete.tournament.id}/close`)
      .send({})
      .expect(422);
    const closed = await request(app)
      .post(`/api/tournaments/${incomplete.tournament.id}/close`)
      .send({ reason: 'Venue closure after rain' })
      .expect(200);
    expect(closed.body.tournament).toMatchObject({ status: 'closed', closingReason: 'Venue closure after rain' });
    await request(app)
      .patch(`/api/tournaments/${incomplete.tournament.id}/resources`)
      .send({ courtCount: 2, matchDurationMinutes: 20, effectiveAtMinutes: 600 })
      .expect(409);
    await request(app)
      .post(`/api/tournaments/${incomplete.tournament.id}/points`)
      .send({ teamId: incomplete.teams[0]!.id, points: 1, reason: 'Late' })
      .expect(409);
    await request(app)
      .post(`/api/tournaments/${incomplete.tournament.id}/matches`)
      .send({ homeTeamId: incomplete.teams[0]!.id, awayTeamId: incomplete.teams[1]!.id })
      .expect(409);

    const completedEvent = await createEvent('manual', 2);
    const noReason = await request(app).post(`/api/tournaments/${completedEvent.tournament.id}/close`).send({}).expect(200);
    expect(noReason.body.tournament.closingReason).toBe('All scheduled matches completed.');
  });

  it('validates every weather limit and replans an event with no staged matches', async () => {
    const event = await createEvent('manual', 2);
    const invalidChanges = [
      { courtCount: 0, matchDurationMinutes: 20, effectiveAtMinutes: 600 },
      { courtCount: 21, matchDurationMinutes: 20, effectiveAtMinutes: 600 },
      { courtCount: 1, matchDurationMinutes: 4, effectiveAtMinutes: 600 },
      { courtCount: 1, matchDurationMinutes: 121, effectiveAtMinutes: 600 },
      { courtCount: 1, matchDurationMinutes: 20, effectiveAtMinutes: 539 },
      { courtCount: 1, matchDurationMinutes: 20, effectiveAtMinutes: 2880 },
    ];
    for (const change of invalidChanges) {
      await request(app).patch(`/api/tournaments/${event.tournament.id}/resources`).send(change).expect(422);
    }
    const changed = await request(app)
      .patch(`/api/tournaments/${event.tournament.id}/resources`)
      .send({ courtCount: 1, matchDurationMinutes: 30, effectiveAtMinutes: 600 })
      .expect(200);
    expect(changed.body.matches).toHaveLength(0);
    expect(changed.body.tournament.matchDurationMinutes).toBe(30);
  });

  it('validates close reasons and rejects closing a tournament twice', async () => {
    const invalidReason = await createEvent('manual', 2);
    await request(app).post(`/api/tournaments/${invalidReason.tournament.id}/close`).send({ reason: 4 }).expect(422);
    await request(app).post(`/api/tournaments/${invalidReason.tournament.id}/close`).send({ reason: 'x'.repeat(501) }).expect(422);
    const closed = await request(app).post(`/api/tournaments/${invalidReason.tournament.id}/close`).send({ reason: '   ' }).expect(200);
    expect(closed.body.tournament.closingReason).toBe('All scheduled matches completed.');
    await request(app).post(`/api/tournaments/${invalidReason.tournament.id}/close`).send({}).expect(409);

    const emptyReason = await createEvent('manual', 2);
    const empty = await request(app).post(`/api/tournaments/${emptyReason.tournament.id}/close`).send({ reason: '' }).expect(200);
    expect(empty.body.tournament.closingReason).toBe('All scheduled matches completed.');
    const nullReason = await createEvent('manual', 2);
    const nullResult = await request(app).post(`/api/tournaments/${nullReason.tournament.id}/close`).send({ reason: null }).expect(200);
    expect(nullResult.body.tournament.closingReason).toBe('All scheduled matches completed.');
  });

  it('does not close over a live match and validates point awards', async () => {
    const event = await createEvent('manual', 2);
    const match = await stageMatch(event, 0, 1);
    await saveLiveScore(event.tournament.id, match.id, 1, 0);
    await request(app).post(`/api/tournaments/${event.tournament.id}/close`).send({ reason: 'Too early' }).expect(409);
    await request(app).post(`/api/tournaments/${event.tournament.id}/points`).send({
      teamId: event.teams[0]!.id,
      points: -1,
      reason: 'Bad amount',
    }).expect(422);
    await request(app).post(`/api/tournaments/${event.tournament.id}/points`).send({
      teamId: event.teams[0]!.id,
      points: 2,
      reason: ' ' ,
    }).expect(422);
  });

  it('does not score an unresolved placeholder or rewrite a final result', async () => {
    const event = await createEvent('single-elimination', 8);
    const nextRound = event.matches.find((match) => match.participants.some((participant) => participant.reference.kind === 'winner'))!;
    await request(app)
      .post(matchPath(event.tournament.id, nextRound.id, 'score'))
      .send({ home: 1, away: 0 })
      .expect(409);
    const first = event.matches[0]!;
    await saveLiveScore(event.tournament.id, first.id, 1, 0);
    await request(app).post(matchPath(event.tournament.id, first.id, 'finalize')).send({ home: 1, away: 0 }).expect(200);
    await request(app).post(matchPath(event.tournament.id, first.id, 'score')).send({ home: 3, away: 1 }).expect(409);
    await request(app).post(matchPath(event.tournament.id, first.id, 'finalize')).send({ home: 3, away: 1 }).expect(409);
  });

  it('validates score bounds and refuses scoring withdrawn or called-off teams', async () => {
    const event = await createEvent('manual', 2);
    const staged = await stageMatch(event, 0, 1);
    await request(app)
      .post(matchPath(event.tournament.id, staged.id, 'finalize'))
      .send({ home: 1, away: 0 })
      .expect(409);
    await request(app)
      .post(matchPath(event.tournament.id, staged.id, 'score'))
      .send({ home: -1, away: 0 })
      .expect(422);
    await request(app)
      .post(matchPath(event.tournament.id, staged.id, 'score'))
      .send({ home: 1000, away: 0 })
      .expect(422);

    await database.db.update(teamsTable).set({ withdrawnAt: new Date().toISOString(), withdrawalReason: 'Injured' })
      .where(eq(teamsTable.id, event.teams[0]!.id));
    await request(app)
      .post(`/api/tournaments/${event.tournament.id}/matches`)
      .send({ homeTeamId: event.teams[0]!.id, awayTeamId: event.teams[1]!.id })
      .expect(404);

    const calledOffEvent = await createEvent('manual', 2);
    const calledOff = await stageMatch(calledOffEvent, 0, 1);
    await database.db.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, calledOff.id));
    await request(app)
      .post(matchPath(calledOffEvent.tournament.id, calledOff.id, 'score'))
      .send({ home: 1, away: 0 })
      .expect(409);
  });

  it('validates manual matchup membership, duplicate sides, and explicit schedule conflicts', async () => {
    const event = await createEvent('manual', 3);
    await request(app).post(`/api/tournaments/${event.tournament.id}/matches`).send({
      homeTeamId: event.teams[0]!.id,
      awayTeamId: event.teams[0]!.id,
    }).expect(422);
    const first = await stageMatch(event, 0, 1);
    await request(app).post(`/api/tournaments/${event.tournament.id}/matches`).send({
      homeTeamId: event.teams[0]!.id,
      awayTeamId: event.teams[2]!.id,
      startMinute: first.schedule.startMinute,
      courtNumber: first.schedule.courtNumber,
    }).expect(409);
    await request(app).post(`/api/tournaments/${event.tournament.id}/matches`).send({
      homeTeamId: event.teams[0]!.id,
      awayTeamId: event.teams[2]!.id,
      roundNumber: 0,
    }).expect(422);
  });
});

describe('unexpected database failures', () => {
  it('returns a generic 500 without leaking driver details', async () => {
    const broken: DatabaseContext = await createDatabase();
    const brokenApp = createApp(broken.db);
    await broken.close();
    const response = await request(brokenApp).get('/api/tournaments').expect(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
    });
  });
});

async function createEvent(
  mode: ModeId,
  teamCount: number,
  overrides: Partial<{ courtCount: number; matchDurationMinutes: number }> = {},
): Promise<TournamentSnapshot> {
  const response = await request(app)
    .post('/api/tournaments')
    .send(input(mode, teamCount, overrides))
    .expect(201);
  return response.body as TournamentSnapshot;
}

async function stageMatch(event: TournamentSnapshot, homeIndex: number, awayIndex: number) {
  const response = await request(app)
    .post(`/api/tournaments/${event.tournament.id}/matches`)
    .send({ homeTeamId: event.teams[homeIndex]!.id, awayTeamId: event.teams[awayIndex]!.id })
    .expect(201);
  return response.body.matches[0] as TournamentSnapshot['matches'][number];
}

async function saveLiveScore(tournamentId: string, matchId: string, home: number, away: number) {
  return request(app).post(matchPath(tournamentId, matchId, 'score')).send({ home, away }).expect(200);
}

function input(
  mode: ModeId,
  teamCount: number,
  overrides: Partial<{ courtCount: number; matchDurationMinutes: number }> = {},
) {
  return {
    name: 'Test Event',
    mode,
    settings: {
      teamCount,
      courtCount: overrides.courtCount ?? 2,
      matchDurationMinutes: overrides.matchDurationMinutes ?? 20,
      tournamentLengthMinutes: 240,
      startTimeMinutes: 540,
    },
    teamNames: Array.from({ length: teamCount }, (_, index) => `Team ${index + 1}`),
  };
}

function matchPath(tournamentId: string, matchId: string, action: string): string {
  return `/api/tournaments/${tournamentId}/matches/${matchId}/${action}`;
}

function findMatch(snapshot: TournamentSnapshot, matchId: string) {
  return snapshot.matches.find((match) => match.id === matchId)!;
}
